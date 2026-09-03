import * as THREE from 'three';

/**
 * 卡片粒子化动效系统配置项
 */
export interface CardParticleSystemOptions {
  /** 粒子数量，默认 2000；主流设备千级粒子可流畅运行 */
  particleCount?: number;
  /** 入场动画时长（毫秒），默认 1200 */
  entryDuration?: number;
  /** 出场动画时长（毫秒），默认 1000 */
  exitDuration?: number;
  /** 主色调（CSS 颜色字符串），不传则从卡片 computedStyle 自动提取 */
  primaryColor?: string;
  /** 随机扰动强度，默认 1.0；越大粒子轨迹越飘逸 */
  disturbance?: number;
  /** 螺旋圈数，默认 2.0；决定聚拢/散开时绕中心旋转的圈数 */
  spiralTurns?: number;
  /** z 轴深度范围（像素），默认 60；用于营造空间层次感 */
  depth?: number;
  /** 是否启用辉光增强，默认 true */
  glow?: boolean;
}

/**
 * 动效播放完成的回调
 */
export interface CardParticleSystemCallbacks {
  /** 入场动画完成回调：业务侧在此显示卡片实体内容 */
  onEntryComplete?: () => void;
  /** 出场动画完成回调：业务侧在此移除卡片 DOM 节点 */
  onExitComplete?: () => void;
}

const DEFAULT_OPTIONS: Required<Omit<CardParticleSystemOptions, 'primaryColor'>> = {
  particleCount: 2000,
  entryDuration: 1200,
  exitDuration: 1000,
  disturbance: 1.0,
  spiralTurns: 2.0,
  depth: 60,
  glow: true,
};

/** 默认主色调：科技蓝，作为颜色提取失败时的兜底 */
const DEFAULT_PRIMARY_COLOR = '#4f7cff';

/**
 * 卡片粒子化动效系统（基于 Three.js WebGL）
 *
 * 与引导功能卡片实体强绑定的粒子化入场/出场动效：
 *
 * - 入场：大量粒子从视口外沿螺旋轨迹向卡片位置聚拢，运动全程叠加自然随机扰动，
 *   最终精准汇聚贴合形成卡片轮廓与填充形态，末段带弹性回弹缓冲；
 *   聚合完成后无缝过渡到实体卡片显示。
 *
 * - 出场：实体卡片先过渡为粒子状态，随后粒子沿螺旋轨迹向外空间散开，
 *   扰动强度逐步增强呈现自然溃散，速度由快到慢缓动，最终飞出视口完全消失。
 *
 * 设计要点：
 * - 正交相机坐标系与 DOM 像素 1:1 对齐（y 轴向下），粒子目标位置直接取自卡片采样
 * - 通过 canvas 2D 绘制圆角矩形 + 遍历子元素增加密度采样粒子目标位置，
 *   不依赖 html2canvas，性能更优且贴合卡片真实形态
 * - 着色器实现螺旋轨迹、弹性回弹、随机扰动、错落时间差、辉光、拖尾等效果
 * - AdditiveBlending 实现辉光叠加，颜色自适应匹配卡片主色调
 *
 * 对外能力：
 * - `init(cardNode)`：传入卡片 DOM 节点自动匹配尺寸与位置
 * - `playEntry()`：播放入场动画，Promise 在聚合完成时 resolve
 * - `playExit()`：播放出场动画，Promise 在溃散完成时 resolve
 * - `dispose()`：释放 GPU 资源
 */
export class CardParticleSystem {
  private readonly options: Required<CardParticleSystemOptions>;
  private readonly callbacks: CardParticleSystemCallbacks;

  private container: HTMLDivElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;

  private rafId = 0;
  private animationStart = 0;
  private animationDuration = 0;
  private currentPhase: 'idle' | 'entry' | 'exit' = 'idle';

  constructor(
    options: CardParticleSystemOptions = {},
    callbacks: CardParticleSystemCallbacks = {},
  ) {
    // 合并默认配置；primaryColor 可选，单独保留
    const { primaryColor, ...rest } = options;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...rest,
      primaryColor: primaryColor ?? DEFAULT_PRIMARY_COLOR,
    } as Required<CardParticleSystemOptions>;
    this.callbacks = callbacks;
  }

  /**
   * 初始化：采样卡片 DOM 形态，构建 Three.js 场景与粒子几何
   *
   * 必须在卡片已渲染到 DOM 后调用。会创建全屏覆盖的 WebGL canvas 容器。
   *
   * @param cardNode 卡片 DOM 节点，用于采样目标位置与主色调
   */
  async init(cardNode: HTMLElement): Promise<void> {
    // 先释放已有场景，避免重复初始化造成 GPU 资源泄漏
    this.disposeScene();

    const rect = cardNode.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      throw new Error('CardParticleSystem: 卡片尺寸过小，无法采样粒子目标位置');
    }

    // 1. 采样卡片 DOM 形态得到粒子目标位置 + 主色调
    const { targetPositions, primaryColor } = this.sampleCardParticles(cardNode, rect);

    // 2. 创建 Three.js 场景：全屏覆盖容器 + 正交相机
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.container = document.createElement('div');
    this.container.className = 'card-particle-system-overlay';
    this.container.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9999;';
    document.body.appendChild(this.container);

    this.scene = new THREE.Scene();
    // 正交相机：左上角 (0,0)，右下角 (width,height)，y 轴向下与 DOM 一致
    // 这样粒子坐标可以直接使用 getBoundingClientRect 的像素值
    this.camera = new THREE.OrthographicCamera(
      0,
      viewportWidth,
      viewportHeight,
      0,
      -1000,
      1000,
    );
    this.camera.position.z = 100;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(viewportWidth, viewportHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    // 3. 构建粒子几何：每个粒子携带目标/起点/终点位置、种子、大小、颜色、错落延迟
    const count = this.options.particleCount;
    const positions = new Float32Array(count * 3); // 当前位置占位，实际由着色器计算
    const aTargetPos = new Float32Array(count * 3);
    const aStartPos = new Float32Array(count * 3);
    const aExitPos = new Float32Array(count * 3);
    const aSeed = new Float32Array(count);
    const aSize = new Float32Array(count);
    const aColor = new Float32Array(count * 3);
    const aDelay = new Float32Array(count);

    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;
    const viewportDiag = Math.hypot(viewportWidth, viewportHeight);

    // 主色调与亮色：用于粒子颜色在主色调基础上做轻微变化
    const baseColor = new THREE.Color(primaryColor);
    const lightColor = baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.45);

    for (let i = 0; i < count; i += 1) {
      const tx = targetPositions[i * 3];
      const ty = targetPositions[i * 3 + 1];
      const tz = targetPositions[i * 3 + 2];

      // 目标位置：粒子聚合终点（贴合卡片形态）
      aTargetPos[i * 3] = tx;
      aTargetPos[i * 3 + 1] = ty;
      aTargetPos[i * 3 + 2] = tz;
      positions[i * 3] = tx;
      positions[i * 3 + 1] = ty;
      positions[i * 3 + 2] = tz;

      // 入场起点：视口外沿球壳随机分布，确保从屏幕外向卡片聚拢
      const startAngle = Math.random() * Math.PI * 2;
      const startDist = viewportDiag * (0.7 + Math.random() * 0.5);
      aStartPos[i * 3] = cardCenterX + Math.cos(startAngle) * startDist;
      aStartPos[i * 3 + 1] = cardCenterY + Math.sin(startAngle) * startDist;
      aStartPos[i * 3 + 2] = (Math.random() - 0.5) * 200;

      // 出场终点：视口外沿更远，确保粒子飞出视口完全消失
      const exitAngle = Math.random() * Math.PI * 2;
      const exitDist = viewportDiag * (1.0 + Math.random() * 0.6);
      aExitPos[i * 3] = cardCenterX + Math.cos(exitAngle) * exitDist;
      aExitPos[i * 3 + 1] = cardCenterY + Math.sin(exitAngle) * exitDist;
      aExitPos[i * 3 + 2] = (Math.random() - 0.5) * 400;

      aSeed[i] = Math.random();
      // 粒子基础大小 2~6 像素，配合 uPixelRatio 在 Retina 屏清晰可见
      aSize[i] = 2 + Math.random() * 4;

      // 颜色：主色调与亮色随机混合，营造光点层次感
      const mix = Math.random();
      const c = baseColor.clone().lerp(lightColor, mix * 0.6);
      aColor[i * 3] = c.r;
      aColor[i * 3 + 1] = c.g;
      aColor[i * 3 + 2] = c.b;

      // 错落时间差 0~0.3：粒子分组依次入场，避免整齐划一
      aDelay[i] = Math.random() * 0.3;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aTargetPos', new THREE.BufferAttribute(aTargetPos, 3));
    this.geometry.setAttribute('aStartPos', new THREE.BufferAttribute(aStartPos, 3));
    this.geometry.setAttribute('aExitPos', new THREE.BufferAttribute(aExitPos, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    this.geometry.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1));

    // 4. 着色器：实现螺旋轨迹、弹性回弹、随机扰动、错落时间差、辉光等效果
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uPhase: { value: 0 }, // 0=入场, 1=出场
        uSpiralTurns: { value: this.options.spiralTurns },
        uDisturbance: { value: this.options.disturbance },
        uDepth: { value: this.options.depth },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uTime: { value: 0 },
        uGlow: { value: this.options.glow ? 1 : 0 },
      },
      vertexShader: CARD_VERTEX_SHADER,
      fragmentShader: CARD_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // AdditiveBlending：粒子重叠处更亮，形成辉光叠加质感
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);

    // 5. 监听窗口尺寸变化，同步相机与渲染器
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * 播放入场动画：粒子从视口外沿螺旋聚拢到卡片位置
   *
   * 完成后触发 `onEntryComplete` 回调，业务侧据此显示卡片实体内容。
   */
  playEntry(): Promise<void> {
    if (!this.scene || !this.material || !this.renderer || !this.camera) {
      return Promise.reject(new Error('CardParticleSystem 未初始化，请先调用 init'));
    }
    this.cancelAnimation();

    return new Promise<void>((resolve) => {
      this.currentPhase = 'entry';
      this.material!.uniforms.uPhase.value = 0;
      this.material!.uniforms.uProgress.value = 0;
      this.animationStart = performance.now();
      this.animationDuration = this.options.entryDuration;

      const tick = (): void => {
        try {
          const elapsed = performance.now() - this.animationStart;
          const progress = Math.min(elapsed / this.animationDuration, 1);
          this.material!.uniforms.uProgress.value = progress;
          this.material!.uniforms.uTime.value = elapsed / 1000;
          this.renderer!.render(this.scene!, this.camera!);

          if (progress < 1) {
            this.rafId = requestAnimationFrame(tick);
          } else {
            this.currentPhase = 'idle';
            this.callbacks.onEntryComplete?.();
            resolve();
          }
        } catch (err) {
          // render 抛错（如 shader 编译失败、WebGL 上下文丢失）时，
          // 仍需 resolve Promise 并触发回调，避免上层 await 卡死导致卡片永远不可见
          console.error('[CardParticleSystem] 入场动画 tick 抛错，提前结束：', err);
          this.currentPhase = 'idle';
          this.callbacks.onEntryComplete?.();
          resolve();
        }
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  /**
   * 播放出场动画：粒子从卡片位置螺旋向外散开飞出视口
   *
   * 完成后触发 `onExitComplete` 回调，业务侧据此移除卡片 DOM 节点。
   */
  playExit(): Promise<void> {
    if (!this.scene || !this.material || !this.renderer || !this.camera) {
      return Promise.reject(new Error('CardParticleSystem 未初始化，请先调用 init'));
    }
    this.cancelAnimation();

    return new Promise<void>((resolve) => {
      this.currentPhase = 'exit';
      this.material!.uniforms.uPhase.value = 1;
      this.material!.uniforms.uProgress.value = 0;
      this.animationStart = performance.now();
      this.animationDuration = this.options.exitDuration;

      const tick = (): void => {
        try {
          const elapsed = performance.now() - this.animationStart;
          const progress = Math.min(elapsed / this.animationDuration, 1);
          this.material!.uniforms.uProgress.value = progress;
          this.material!.uniforms.uTime.value = elapsed / 1000;
          this.renderer!.render(this.scene!, this.camera!);

          if (progress < 1) {
            this.rafId = requestAnimationFrame(tick);
          } else {
            this.currentPhase = 'idle';
            this.callbacks.onExitComplete?.();
            resolve();
          }
        } catch (err) {
          // render 抛错时仍需 resolve Promise 并触发回调，避免上层 await 卡死
          console.error('[CardParticleSystem] 出场动画 tick 抛错，提前结束：', err);
          this.currentPhase = 'idle';
          this.callbacks.onExitComplete?.();
          resolve();
        }
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  /** 释放 GPU 资源，移除 DOM 容器，解除事件绑定 */
  dispose(): void {
    this.cancelAnimation();
    window.removeEventListener('resize', this.handleResize);
    this.disposeScene();
  }

  /**
   * 隐藏粒子 canvas（入场完成后调用，让卡片实体内容显示出来）
   *
   * 入场动画结束时粒子聚合在卡片位置，若不移除 canvas 会遮挡卡片内容。
   * 仅隐藏 DOM 显示，不释放 Three.js 资源，供出场动画复用。
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 显示粒子 canvas（出场动画前调用，让粒子重新可见）
   *
   * 出场动画需要粒子从卡片位置散开，需先将 canvas 恢复显示。
   */
  show(): void {
    if (this.container) {
      this.container.style.display = '';
    }
  }

  /** 当前动画阶段，用于外部状态判断 */
  get phase(): 'idle' | 'entry' | 'exit' {
    return this.currentPhase;
  }

  /** 取消正在播放的动画帧 */
  private cancelAnimation(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.currentPhase = 'idle';
  }

  /** 释放 Three.js 场景资源（不移除事件监听） */
  private disposeScene(): void {
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.points = null;
  }

  /** 窗口尺寸变化时同步正交相机与渲染器，保证粒子坐标系始终对齐 DOM */
  private handleResize = (): void => {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  /**
   * 采样卡片 DOM 形态得到粒子目标位置
   *
   * 实现思路（不依赖 html2canvas）：
   * 1. 用 canvas 2D 绘制卡片的圆角矩形作为基础轮廓
   * 2. 遍历卡片内子元素，在 canvas 上叠加区域，让粒子分布贴合卡片内部结构
   *    （标题、按钮、文字区域等有可见背景或文本的元素会增加局部粒子密度）
   * 3. 遍历 canvas 像素，采样不透明像素作为粒子目标位置
   *
   * 这样粒子聚合后会精准呈现卡片的轮廓与内部填充形态，与卡片实体强绑定。
   */
  private sampleCardParticles(
    cardNode: HTMLElement,
    rect: DOMRect,
  ): { targetPositions: Float32Array; primaryColor: string } {
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    // 降采样到较低分辨率：性能更好，且采样点足够密集
    const scale = 0.3;
    const canvasW = Math.max(1, Math.ceil(width * scale));
    const canvasH = Math.max(1, Math.ceil(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CardParticleSystem: 无法创建 canvas 2D 上下文');
    }

    const computed = window.getComputedStyle(cardNode);
    const borderRadius = parseFloat(computed.borderRadius) || 0;

    // 提取主色调：用于粒子颜色自适应匹配卡片
    const primaryColor = this.extractPrimaryColor(computed, cardNode);

    // 1. 绘制卡片基础轮廓（圆角矩形）
    ctx.fillStyle = '#ffffff';
    this.drawRoundedRect(ctx, 0, 0, canvasW, canvasH, borderRadius * scale);
    ctx.fill();

    // 2. 遍历子元素，在 canvas 上叠加区域，让粒子分布贴合卡片内部结构
    const childElements = cardNode.querySelectorAll('*');
    childElements.forEach((el) => {
      const childRect = el.getBoundingClientRect();
      const x = (childRect.left - rect.left) * scale;
      const y = (childRect.top - rect.top) * scale;
      const w = childRect.width * scale;
      const h = childRect.height * scale;
      // 过滤越界与过小元素
      if (w < 1 || h < 1) return;
      if (x + w < 0 || y + h < 0 || x > canvasW || y > canvasH) return;

      const childComputed = window.getComputedStyle(el);
      const childRadius = parseFloat(childComputed.borderRadius) || 0;
      const childBg = childComputed.backgroundColor;
      const hasVisibleBg =
        childBg && childBg !== 'rgba(0, 0, 0, 0)' && childBg !== 'transparent';

      if (hasVisibleBg) {
        // 有可见背景的元素：填充不透明白色，作为粒子高密度区
        ctx.fillStyle = '#ffffff';
        this.drawRoundedRect(ctx, x, y, w, h, childRadius * scale);
        ctx.fill();
      } else if (el.children.length === 0 && el.textContent && el.textContent.trim().length > 0) {
        // 叶子文本节点：用半透明白色增加粒子密度，让文字区域也有粒子聚集
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.drawRoundedRect(ctx, x, y, w, h, Math.min(2, Math.min(w, h) / 2));
        ctx.fill();
      }
    });

    // 3. 采样不透明像素作为粒子目标候选位置
    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    const opaquePixels: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < canvasH; y += 1) {
      for (let x = 0; x < canvasW; x += 1) {
        const idx = (y * canvasW + x) * 4;
        if (imageData.data[idx + 3] > 128) {
          opaquePixels.push({ x, y });
        }
      }
    }

    if (opaquePixels.length === 0) {
      // 兜底：均匀填充整个卡片区域，保证总有粒子目标位置
      for (let i = 0; i < this.options.particleCount; i += 1) {
        opaquePixels.push({
          x: Math.random() * canvasW,
          y: Math.random() * canvasH,
        });
      }
    }

    // 4. 按粒子数从候选位置随机采样，转回视口像素坐标
    const count = this.options.particleCount;
    const targetPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const sample = opaquePixels[Math.floor(Math.random() * opaquePixels.length)];
      // 转回 DOM 像素坐标，加上微小抖动让边缘更自然
      const px = sample.x / scale + (Math.random() - 0.5) * 2;
      const py = sample.y / scale + (Math.random() - 0.5) * 2;
      // 转到视口坐标（与正交相机对齐）
      targetPositions[i * 3] = rect.left + px;
      targetPositions[i * 3 + 1] = rect.top + py;
      targetPositions[i * 3 + 2] = 0;
    }

    return { targetPositions, primaryColor };
  }

  /**
   * 从卡片 computedStyle 提取主色调
   *
   * 优先级：
   * 1. `data-particle-color` 属性（业务侧显式指定）
   * 2. CSS 自定义属性 `--primary-color` / `--accent-color` / `--brand-color` / `--theme-color`
   * 3. `backgroundColor` / `borderColor` / `color`
   * 4. 兜底默认色（科技蓝）
   */
  private extractPrimaryColor(computed: CSSStyleDeclaration, cardNode: HTMLElement): string {
    const candidates: string[] = [];

    // 业务侧显式指定优先
    const dataColor = cardNode.dataset.particleColor;
    if (dataColor) candidates.push(dataColor);

    // CSS 自定义属性（设计系统变量）
    const cssVars = ['--primary-color', '--accent-color', '--brand-color', '--theme-color'];
    for (const v of cssVars) {
      const val = computed.getPropertyValue(v).trim();
      if (val) candidates.push(val);
    }

    // computedStyle 常见颜色字段
    candidates.push(computed.backgroundColor);
    candidates.push(computed.borderColor);
    candidates.push(computed.color);

    for (const c of candidates) {
      if (!c) continue;
      if (c === 'rgba(0, 0, 0, 0)' || c === 'transparent') continue;
      try {
        // 验证颜色可被 THREE.Color 解析
        new THREE.Color(c);
        return c;
      } catch {
        // 忽略无效颜色，继续尝试下一个候选
      }
    }

    return DEFAULT_PRIMARY_COLOR;
  }

  /** 绘制圆角矩形路径（兼容 radius=0 的直角情况） */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (radius === 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
    }
    ctx.closePath();
  }
}

/**
 * 卡片粒子化顶点着色器
 *
 * 核心逻辑：
 * - 入场（uPhase=0）：粒子从 aStartPos 沿螺旋轨迹聚拢到 aTargetPos，末段弹性回弹
 * - 出场（uPhase=1）：粒子从 aTargetPos 沿螺旋轨迹散开到 aExitPos，扰动逐步增强
 *
 * 视觉细节：
 * - 螺旋轨迹：角度随时间增长，半径随相位变化（入场衰减、出场增强）
 * - 弹性回弹：入场末段在目标位置附近做衰减振荡
 * - 随机扰动：基于种子和时间的高频噪声，入场衰减、出场增强
 * - 错落时间差：每个粒子有 aDelay 偏移，分组依次入场
 * - z 轴深度：正交相机下 z 不影响投影大小，但通过 PointSize 与 alpha 模拟透视感
 */
const CARD_VERTEX_SHADER = /* glsl */ `
attribute vec3 aTargetPos;
attribute vec3 aStartPos;
attribute vec3 aExitPos;
attribute float aSeed;
attribute float aSize;
attribute vec3 aColor;
attribute float aDelay;

uniform float uProgress;   // 0 -> 1
uniform float uPhase;      // 0=入场, 1=出场
uniform float uSpiralTurns;
uniform float uDisturbance;
uniform float uDepth;
uniform float uPixelRatio;
uniform float uTime;
uniform float uGlow;

varying float vAlpha;
varying vec3 vColor;
varying float vGlow;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// ease-out 缓动：先快后慢
float easeOutCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }
float easeOutQuad(float t) { return 1.0 - (1.0 - t) * (1.0 - t); }

void main() {
  vec3 pos;
  float alpha;
  float glow = 1.0;
  // 用于模拟 z 轴深度的尺寸缩放：远处粒子更小
  float depthScale = 1.0;

  if (uPhase < 0.5) {
    // ===== 入场：螺旋聚拢 =====
    // 错落时间差：每个粒子有 aDelay 偏移（0~0.3），分组依次入场
    float delay = aDelay * 0.3;
    float t = clamp((uProgress - delay) / (1.0 - delay), 0.0, 1.0);
    float te = easeOutCubic(t);

    // 基础轨迹：起点 -> 目标
    vec3 basePos = mix(aStartPos, aTargetPos, te);

    // 螺旋偏移：叠加在基础轨迹上，垂直于运动方向
    // 螺旋半径从大到小（聚拢感）
    float angle = t * uSpiralTurns * TAU + aSeed * TAU;
    float radius = (1.0 - te) * 80.0;

    // 螺旋轴沿运动方向，构造垂直平面
    vec3 moveDir = normalize(aTargetPos - aStartPos + vec3(0.001));
    vec3 up = vec3(0.0, 0.0, 1.0);
    vec3 rightAxis = normalize(cross(moveDir, up));
    vec3 ortho = normalize(cross(rightAxis, moveDir));
    vec3 spiralOffset = (cos(angle) * rightAxis + sin(angle) * ortho) * radius;

    pos = basePos + spiralOffset;
    // z 轴深度：从远到近，营造空间层次感
    pos.z += (1.0 - te) * uDepth;

    // 末段弹性回弹（t > 0.7）：在目标位置附近做衰减振荡
    float elasticT = clamp((t - 0.7) / 0.3, 0.0, 1.0);
    float elastic = sin(elasticT * PI * 3.0) * (1.0 - elasticT) * 6.0;
    pos += vec3(cos(aSeed * TAU), sin(aSeed * TAU), 0.0) * elastic;

    // 随机扰动：随时间衰减，避免起始轨迹生硬
    float disturb = uDisturbance * (1.0 - te) * 15.0;
    pos.x += sin(uTime * 3.0 + aSeed * 17.0) * disturb;
    pos.y += cos(uTime * 2.7 + aSeed * 13.0) * disturb;
    pos.z += sin(uTime * 4.0 + aSeed * 19.0) * disturb * 0.5;

    // alpha：开始时淡入
    alpha = smoothstep(0.0, 0.15, t);
    // 末段辉光增强：聚合时粒子更亮
    glow = 1.0 + (1.0 - abs(t - 0.85)) * 0.6;
    // 深度尺寸：远处粒子略小
    depthScale = 1.0 - (1.0 - te) * 0.3;
  } else {
    // ===== 出场：螺旋散开 =====
    // 速度由快到慢：easeOutQuad
    float t = easeOutQuad(uProgress);

    // 基础轨迹：目标 -> 终点
    vec3 basePos = mix(aTargetPos, aExitPos, t);

    // 螺旋偏移：半径从小到大（散开感）
    float angle = t * uSpiralTurns * TAU + aSeed * TAU;
    float radius = t * 100.0;

    // 螺旋轴沿运动方向
    vec3 moveDir = normalize(aExitPos - aTargetPos + vec3(0.001));
    vec3 up = vec3(0.0, 0.0, 1.0);
    vec3 rightAxis = normalize(cross(moveDir, up));
    vec3 ortho = normalize(cross(rightAxis, moveDir));
    vec3 spiralOffset = (cos(angle) * rightAxis + sin(angle) * ortho) * radius;

    pos = basePos + spiralOffset;
    // z 轴深度：从近到远
    pos.z += t * uDepth * 1.5;

    // 扰动逐步增强，呈现自然溃散
    float disturb = uDisturbance * t * 25.0;
    pos.x += sin(uTime * 4.0 + aSeed * 21.0) * disturb;
    pos.y += cos(uTime * 3.5 + aSeed * 15.0) * disturb;
    pos.z += sin(uTime * 5.0 + aSeed * 11.0) * disturb * 0.5;

    // alpha：末段淡出
    alpha = 1.0 - smoothstep(0.65, 1.0, t);
    glow = 1.0 + t * 0.4;
    // 深度尺寸：飞远时粒子略小
    depthScale = 1.0 - t * 0.4;
  }

  vAlpha = alpha;
  vColor = aColor;
  vGlow = mix(1.0, glow, uGlow);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  // 正交相机下深度不影响投影大小，通过 depthScale 与种子脉动模拟透视感
  float pulse = 1.0 + 0.15 * sin(uTime * 5.0 + aSeed * TAU);
  gl_PointSize = aSize * uPixelRatio * pulse * depthScale;
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * 卡片粒子化片元着色器
 *
 * 实现圆形粒子 + 中心高亮 + 软边缘辉光：
 * - 中心白色高光：强化光点质感
 * - 软边缘：smoothstep 实现羽化
 * - AdditiveBlending：粒子重叠处更亮，形成辉光叠加
 */
const CARD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying float vAlpha;
varying vec3 vColor;
varying float vGlow;

void main() {
  // 圆形粒子：到中心距离超过 0.5 丢弃
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  // 中心高亮 + 软边缘光晕
  float core = smoothstep(0.5, 0.0, dist);
  float halo = smoothstep(0.5, 0.2, dist) * 0.7;

  // 颜色：主色调 * 辉光系数
  vec3 color = vColor * vGlow;
  // 中心白色高光，强化光点质感
  color = mix(color, vec3(1.0), core * 0.5);

  float alpha = (core * 0.8 + halo) * vAlpha;
  gl_FragColor = vec4(color, alpha);
}
`;
