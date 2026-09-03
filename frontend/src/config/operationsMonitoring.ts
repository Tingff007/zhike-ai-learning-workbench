/** 云原生运维舱 — 与具体知识库/模型厂商解耦的监控文案 */
export const operationsMonitoringCopy = {
  title: '云原生运维舱',
  subtitle:
    '监测云端资产、链路状态、API 成本与安全拒答。本地不再承担切片与向量化，监控重心转向供应链与计费。',
  scopeAllHint: '全平台汇总各课程空间',
  scopeCourseHint: '当前课程空间',

  sectionCost: '成本与额度',
  sectionLink: '链路与健康',
  sectionLatency: '性能与时延',
  sectionGuardrail: '安全阻断 · Guardrail 审计',
  sectionAssets: '云端知识资产',
  sectionAlerts: '告警与事件',

  tokenToday: '今日 Token',
  estimatedCost: '估算费用',
  courseQuota: '课程日额度',
  storageDocs: '托管文档',
  quotaUnlimited: '未设上限',
  quotaUsage: (used: number, limit: number) => `${used.toLocaleString()} / ${limit.toLocaleString()}`,

  webhookEndpoint: '状态回调',
  webhookHint: '文档处理完成后由云端 POST/GET 回调；丢包时由补偿轮询兜底。',
  syncCompensation: '补偿轮询',
  stuckInCloud: '云端卡住',
  credentialsLabel: '知识向量化',
  gatewayLabel: '网关中心',

  ragLatency: '云端检索 P50',
  chatP95: '对话 P95',
  firstTokenHint: '首字时延取自流式 Chat 调用日志（有数据时展示）',
  guardrailHint: '检索 Top 分低于 0.65 或零命中时主动拒答，防止幻觉。',
  guardrailEmpty: '暂无低置信度拦截样本（真实对话产生后写入检索日志）。',

  cloudIngestionTitle: '云端入库流水线',
  cloudIngestionEmpty: '暂无云端托管文档',
  legacyQueueNote: '资源生成队列仍在本平台；文档解析与向量化均在云端完成。',

  alertStable: '链路状态稳定',
  noAlerts: '暂无告警事件',
  noEvents: '暂无异常事件',
  noProviderHealth: '暂无供应商健康数据',
  dataLoadingBanner: '指标刷新中，当前为占位展示',
  dataErrorBanner: '部分指标暂时无法获取，已用占位符展示',
  openCredentials: '网关 · 知识向量化',
  openGateway: '网关 · Chat 模型',
  openKnowledge: '知识大本营',
} as const;
