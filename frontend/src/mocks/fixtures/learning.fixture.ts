import type { LearningProfileResponse } from '../../types';

export const mockCourses = [
  { id: 'deep_learning_001', title: '深度学习', description: '深度学习示例课程', status: 'published', applicable_major: '计算机 / 人工智能', display_config: {} },
  { id: 'machine_learning_001', title: '机器学习', description: '监督学习、无监督学习和模型评估', status: 'published', applicable_major: '计算机 / 数据科学', display_config: {} },
  { id: 'ai_intro_001', title: '人工智能导论', description: 'AI 基础概念、搜索、知识表示和智能系统', status: 'draft', applicable_major: '人工智能', display_config: {} },
];

const profileDimensions = [
  { key: 'knowledge_base', name: '知识基础', score: 72, label: '中等偏上', confidence: 0.82, evidence: ['自测表现高于班级 68%'] },
  { key: 'cognitive_style', name: '认知风格', score: 80, label: '图解型', confidence: 0.74, evidence: ['偏好可视化与结构化表达'] },
  { key: 'hands_on', name: '动手偏好', score: 78, label: '高', confidence: 0.76, evidence: ['多次完成 PyTorch 实验'] },
  { key: 'risk', name: '风险预警', score: 42, label: '反向传播概念混淆', confidence: 0.72, evidence: ['链式法则表达不稳定'] },
];

export const learningMock = {
  path: [
    { id: 'node_001', course_id: 'deep_learning_001', concept_id: 'nn_basic', title: '神经网络基础', mastery: 92, status: 'mastered', prerequisites: [] },
    { id: 'node_002', course_id: 'deep_learning_001', concept_id: 'backpropagation', title: '反向传播与优化', mastery: 68, status: 'learning', prerequisites: ['node_001'] },
    { id: 'node_002_r', course_id: 'deep_learning_001', concept_id: 'backpropagation', title: '链式求导与梯度理解', mastery: 35, status: 'needs_remedial', is_remedial: true, isRemedial: true, prerequisites: ['node_001'] },
    { id: 'node_003', course_id: 'deep_learning_001', concept_id: 'regularization', title: '正则化与泛化', mastery: 75, status: 'review', prerequisites: ['node_002'] },
    { id: 'node_004', course_id: 'deep_learning_001', concept_id: 'cnn_convolution', title: '卷积神经网络', mastery: 88, status: 'mastered', prerequisites: ['node_003'] },
    { id: 'node_005', course_id: 'deep_learning_001', concept_id: 'rnn_transformer', title: '循环神经网络与序列建模', mastery: 0, status: 'not_started', prerequisites: ['node_004'] },
    { id: 'node_006', course_id: 'deep_learning_001', concept_id: 'transformer_attention', title: '注意力机制与 Transformer', mastery: 0, status: 'not_started', prerequisites: ['node_005'] },
    { id: 'node_007', course_id: 'deep_learning_001', concept_id: 'autoencoder_generative', title: '自编码器与生成模型', mastery: 0, status: 'not_started', prerequisites: ['node_006'] },
  ],
  concepts: [
    { id: 'nn_basic', course_id: 'deep_learning_001', title: '神经网络基础', definition: '感知机、多层感知机、激活函数与前向传播。', difficulty: 'basic', recommended_order: 1, prerequisites: [], status: 'published' },
    { id: 'backpropagation', course_id: 'deep_learning_001', title: '反向传播与优化', definition: '链式法则、误差反传、梯度下降与 Adam。', difficulty: 'medium', recommended_order: 2, prerequisites: ['nn_basic'], status: 'published' },
    { id: 'regularization', course_id: 'deep_learning_001', title: '正则化与泛化', definition: 'L1/L2、Dropout、数据增强与泛化能力。', difficulty: 'medium', recommended_order: 3, prerequisites: ['backpropagation'], status: 'published' },
    { id: 'cnn_convolution', course_id: 'deep_learning_001', title: '卷积神经网络', definition: '卷积层、池化层、局部感受野与经典 CNN 架构。', difficulty: 'medium', recommended_order: 4, prerequisites: ['regularization'], status: 'published' },
    { id: 'transformer_attention', course_id: 'deep_learning_001', title: '注意力机制与 Transformer', definition: '自注意力、多头注意力、位置编码与编码器结构。', difficulty: 'advanced', recommended_order: 6, prerequisites: ['cnn_convolution'], status: 'published' },
  ],
  mastery: {
    course_id: 'deep_learning_001',
    overall: 64,
    overall_delta: 0,
    peer_percentile: 72,
    path_confidence: 78,
    dimensions: { 神经网络基础: 92, 反向传播与优化: 68, 链式求导: 35, 正则化与泛化: 75, 卷积神经网络: 88 },
  },
  profile: {
    course_id: 'deep_learning_001',
    summary: '基础水平中等偏上，偏好图解和代码实验，当前风险点集中在链式求导、池化层差异和 BatchNorm 推理阶段。',
    confidence: 0.78,
    dimensions: profileDimensions,
  },
  learningProfile: {
    user_id: 'mock-user-zhang',
    active_course_id: 'deep_learning_001',
    global: {
      scope: 'global',
      summary: '计算机专业背景，偏好代码实践与图解结合，适合碎片化稳步推进；通用短板集中在矩阵运算与公式推导。',
      confidence: 0.81,
      major: '计算机科学与技术',
      long_term_goals: ['完成深度学习课程项目', '具备 AI 项目实践能力', '通过阶段测验'],
      resource_preferences: ['代码实验', '图解讲义', '自测题', '错题补救卡'],
      updated_at: '2026-06-05T08:30:00Z',
      dimensions: [
        { key: 'major_background', name: '专业背景', score: 78, label: '计算机 / Python 熟悉', confidence: 0.88, scope: 'global', updated_at: '2026-06-05T08:30:00Z', evidence_summary: '多次对话确认专业与已有编程基础', source_type: 'conversation', evidence: ['自我介绍为计算机专业，Python 与数据结构基础扎实。'] },
        { key: 'learning_goal', name: '学习目标', score: 82, label: '项目实践导向', confidence: 0.79, scope: 'global', updated_at: '2026-06-04T16:20:00Z', evidence_summary: '长期目标在 3 次规划中保持一致', source_type: 'conversation', evidence: ['希望完成深度学习项目并具备 AI 工程能力。'] },
        { key: 'cognitive_style', name: '认知风格', score: 84, label: '代码实践型', confidence: 0.82, scope: 'global', updated_at: '2026-06-05T06:10:00Z', evidence_summary: '偏好通过小实验理解抽象概念', source_type: 'resource_usage', evidence: ['频繁请求 PyTorch 代码示例与可运行沙箱。'] },
        { key: 'learning_pace', name: '学习节奏', score: 72, label: '碎片化稳步推进', confidence: 0.69, scope: 'global', updated_at: '2026-06-03T12:00:00Z', evidence_summary: '短时高频提问，适合拆分路径', source_type: 'conversation', evidence: ['每次学习 30-45 分钟，偏好小步快跑。'] },
        { key: 'resource_preference', name: '资源偏好', score: 77, label: '讲义 + 代码案例', confidence: 0.83, scope: 'global', updated_at: '2026-06-05T07:45:00Z', evidence_summary: '复用讲义摘要与实验资源频率高', source_type: 'resource_usage', evidence: ['经常下载图解讲义并复用代码实验。'] },
        { key: 'general_weakness', name: '通用能力短板', score: 46, label: '矩阵维度敏感', confidence: 0.74, scope: 'global', updated_at: '2026-06-04T09:30:00Z', evidence_summary: '多门课程出现类似维度混淆', source_type: 'assessment', evidence: ['矩阵乘法与广播机制理解不稳定。'] },
      ],
    },
    course: {
      scope: 'course',
      course_id: 'deep_learning_001',
      course_title: '深度学习',
      summary: '基础水平中等偏上，当前节点为反向传播与优化，掌握度 64%；风险点集中在链式求导与矩阵维度。',
      confidence: 0.78,
      current_node: '反向传播与优化',
      mastery: 0.64,
      weak_points: ['链式求导', '矩阵维度', '广播机制', 'BatchNorm 推理阶段'],
      updated_at: '2026-06-05T09:00:00Z',
      dimensions: [
        { key: 'knowledge_base', name: '知识基础', score: 72, label: 'Tensor 操作基本可用', confidence: 0.82, scope: 'course', updated_at: '2026-06-05T09:00:00Z', evidence_summary: '自测表现高于班级 68%', source_type: 'assessment', evidence: ['神经网络基础掌握稳定，反向传播仍需补强。'] },
        { key: 'error_pattern', name: '易错点', score: 44, label: '矩阵维度 / 广播机制', confidence: 0.81, scope: 'course', updated_at: '2026-06-05T08:50:00Z', evidence_summary: '错题集中在维度对齐', source_type: 'assessment', evidence: ['多次在 Batch 维与特征维之间混淆。'] },
        { key: 'resource_preference', name: '资源偏好', score: 79, label: 'PyTorch 实验 + 图解', confidence: 0.8, scope: 'course', updated_at: '2026-06-04T11:20:00Z', evidence_summary: '课程内资源复用偏好明确', source_type: 'resource_usage', evidence: ['偏好 PyTorch 实验与反向传播动画讲解。'] },
        { key: 'transfer', name: '迁移能力', score: 52, label: '换场景易卡住', confidence: 0.68, scope: 'course', updated_at: '2026-06-03T20:00:00Z', evidence_summary: '综合题转换不稳定', source_type: 'assessment', evidence: ['能复述概念，但综合题迁移偏弱。'] },
      ],
    },
    session: {
      scope: 'session',
      conversation_id: 'c_mock_001',
      topic: '反向传播与链式法则',
      intent: '概念解释',
      temporary_goal: '搞懂梯度如何从输出层传回输入层',
      summary: '当前会话聚焦反向传播概念澄清，临时偏好为少公式、多图解。',
      updated_at: '2026-06-05T10:15:00Z',
      dimensions: [
        { key: 'session_topic', name: '当前主题', score: 90, label: '反向传播与链式法则', confidence: 0.92, scope: 'session', updated_at: '2026-06-05T10:15:00Z', evidence_summary: '本轮前 3 条消息均围绕该主题', source_type: 'conversation', evidence: ['用户追问链式法则在计算图中的传递路径。'] },
        { key: 'session_intent', name: '当前任务意图', score: 85, label: '概念解释', confidence: 0.88, scope: 'session', updated_at: '2026-06-05T10:12:00Z', evidence_summary: '未触发资源生成', source_type: 'conversation', evidence: ['请求用图解方式解释梯度流动。'] },
        { key: 'course_binding', name: '是否绑定课程', score: 100, label: '已绑定：深度学习', confidence: 1, scope: 'session', updated_at: '2026-06-05T10:00:00Z', evidence_summary: '当前会话关联 deep_learning_001', source_type: 'conversation', evidence: ['会话创建时选择了深度学习课程。'] },
      ],
    },
    cross_course: {
      scope: 'cross_course',
      summary: '多门课程共同暴露矩阵运算与链式求导薄弱，可能影响深度学习反向传播与机器学习梯度理解。',
      common_weaknesses: ['矩阵维度与广播机制', '链式法则 / 复合求导', '概率密度直觉'],
      transfer_hints: ['例题会做，换数据形状或损失函数后容易卡住', '能复述定义，但难以独立推导梯度'],
      prerequisite_alerts: ['高等数学链式法则薄弱 → 影响深度学习反向传播', '线性代数矩阵乘法不稳 → 影响 CNN 特征图尺寸计算'],
      updated_at: '2026-06-05T08:00:00Z',
      dimensions: [
        { key: 'common_weakness', name: '共性短板', score: 42, label: '矩阵运算 + 链式求导', confidence: 0.77, scope: 'cross_course', updated_at: '2026-06-05T08:00:00Z', evidence_summary: '3 门课程测验均出现', source_type: 'assessment', evidence: ['深度学习、机器学习、线性代数均出现维度错误。'] },
        { key: 'transfer', name: '迁移能力', score: 55, label: '场景切换不稳', confidence: 0.72, scope: 'cross_course', updated_at: '2026-06-04T18:30:00Z', evidence_summary: '多课程综合题表现一致偏低', source_type: 'assessment', evidence: ['换题型后正确率下降约 20-30%。'] },
      ],
    },
  } satisfies LearningProfileResponse,
  resources: [
    {
      id: 'res_001', course_id: 'deep_learning_001', concept_id: 'backpropagation', path_node_id: 'node_002_r', title: '反向传播动画讲解', resource_type: 'video', type: '视频脚本', difficulty: 'basic', difficulty_label: '基础', status: 'featured', summary: '通过动画展示链式法则与梯度流动，适合补救反向传播概念。', quality: 'A+', refs: 3, quality_score: 92, latest_version: 2,
      content: '# 反向传播：像接力传话一样传梯度\n\n损失函数先告诉我们「错在哪」，误差信号从输出端出发。',
      citations: [{ source_title: '深度学习讲义第 8 章.pdf', page_no: 118, similarity: 0.82, snippet: '反向传播利用链式法则逐层传播误差信号。' }],
    },
    {
      id: 'res_002', course_id: 'deep_learning_001', concept_id: 'cnn_convolution', path_node_id: 'node_004', title: 'PyTorch CNN 实验模板', resource_type: 'code_lab', type: '代码实验', difficulty: 'medium', difficulty_label: '中级', status: 'featured', summary: '基于 CIFAR-10 的 CNN 分类实验，包含训练、评估和特征图可视化。', quality: 'A+', refs: 4, quality_score: 94, latest_version: 3,
      content: '# PyTorch CNN 最小实验\n\n完成数据加载、模型定义、训练循环与评估。',
      citations: [{ source_title: 'CNN 实验指导.md', page_no: 6, similarity: 0.87, snippet: 'CNN 实验应包含数据加载、模型定义、训练循环与评估。' }],
    },
    {
      id: 'res_003', course_id: 'deep_learning_001', concept_id: 'regularization', path_node_id: 'node_003', title: 'Batch Normalization 原理与实践', resource_type: 'lecture', type: '讲义', difficulty: 'medium', difficulty_label: '中级', status: 'published', summary: '系统讲解 BN 的训练/推理差异，并通过实验对比收敛速度。', quality: 'A', refs: 2, quality_score: 88, latest_version: 1,
      content: '# BatchNorm：一句话先懂\n\n训练时用当前 batch 的均值和方差；推理时用滑动平均统计量。',
      citations: [{ source_title: 'BatchNorm 论文摘录.pdf', page_no: 2, similarity: 0.78, snippet: 'BatchNorm 在训练和推理阶段使用不同统计量。' }],
    },
  ],
  resourceVersions: [
    { id: 'ver_001', version: 1, content: '初始版本：课程讲义摘要。', meta: { reviewer: '系统' }, created_at: '2024-05-18 10:20' },
    { id: 'ver_002', version: 2, content: '补充引用来源与个性化提示。', meta: { reviewer: '管理员' }, created_at: '2024-05-20 09:30' },
  ],
};
