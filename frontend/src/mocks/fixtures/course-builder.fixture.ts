import type { CourseBuilderOutline } from '../../types';

export const courseBuilderMock = {
  outline: {
    course: {
      id: 'deep_learning_001',
      title: '深度学习',
      description: '围绕神经网络、优化方法、卷积结构和 Transformer 的课程级智能学习示例。',
      status: 'published',
      applicable_major: '计算机 / 人工智能',
      display_config: { accent: '#2563eb' },
    },
    sections: [
      {
        id: 'neural_network_basics',
        course_id: 'deep_learning_001',
        title: '神经网络基础',
        description: '神经网络、激活函数和前向传播',
        order_index: 1,
        concepts: [
          { id: 'perceptron_mlp', course_id: 'deep_learning_001', title: '感知机与多层感知机', section_id: 'neural_network_basics', section_title: '神经网络基础', difficulty: 'basic', recommended_order: 1, prerequisites: [], status: 'published', definition: '从感知机出发理解多层网络的表示能力。' },
          { id: 'activation_functions', course_id: 'deep_learning_001', title: '激活函数', section_id: 'neural_network_basics', section_title: '神经网络基础', difficulty: 'basic', recommended_order: 2, prerequisites: ['perceptron_mlp'], status: 'published', definition: 'Sigmoid、ReLU 与梯度传播的关系。' },
          { id: 'forward_propagation', course_id: 'deep_learning_001', title: '前向传播', section_id: 'neural_network_basics', section_title: '神经网络基础', difficulty: 'basic', recommended_order: 3, prerequisites: ['activation_functions'], status: 'published', definition: '输入、权重、偏置和激活逐层计算。' },
        ],
      },
      {
        id: 'backprop_optimization',
        course_id: 'deep_learning_001',
        title: '反向传播与优化',
        description: '链式求导、反向传播和梯度优化',
        order_index: 2,
        concepts: [
          { id: 'chain_rule', course_id: 'deep_learning_001', title: '链式求导', section_id: 'backprop_optimization', section_title: '反向传播与优化', difficulty: 'intermediate', recommended_order: 4, prerequisites: ['forward_propagation'], status: 'published', definition: '用链式法则分解复合函数梯度。' },
          { id: 'backpropagation', course_id: 'deep_learning_001', title: '反向传播算法', section_id: 'backprop_optimization', section_title: '反向传播与优化', difficulty: 'intermediate', recommended_order: 5, prerequisites: ['chain_rule'], status: 'published', definition: '从损失函数向前层递推梯度。' },
          { id: 'optimization_algorithms', course_id: 'deep_learning_001', title: '优化算法', section_id: 'backprop_optimization', section_title: '反向传播与优化', difficulty: 'intermediate', recommended_order: 6, prerequisites: ['backpropagation'], status: 'published', definition: 'SGD、Momentum、Adam 的适用场景。' },
        ],
      },
      { id: 'regularization_generalization', course_id: 'deep_learning_001', title: '正则化与泛化', description: '模型容量、过拟合和泛化能力', order_index: 3, concepts: [] },
      {
        id: 'cnn',
        course_id: 'deep_learning_001',
        title: '卷积神经网络',
        description: '卷积层、池化层和经典 CNN 架构',
        order_index: 4,
        concepts: [
          { id: 'convolution_layer', course_id: 'deep_learning_001', title: '卷积层', section_id: 'cnn', section_title: '卷积神经网络', difficulty: 'advanced', recommended_order: 7, prerequisites: ['forward_propagation'], status: 'published', definition: '理解卷积核、感受野和特征图。' },
          { id: 'pooling_layer', course_id: 'deep_learning_001', title: '池化层', section_id: 'cnn', section_title: '卷积神经网络', difficulty: 'advanced', recommended_order: 8, prerequisites: ['convolution_layer'], status: 'published', definition: '降低空间维度并增强局部鲁棒性。' },
          { id: 'classic_cnn', course_id: 'deep_learning_001', title: '经典 CNN 架构', section_id: 'cnn', section_title: '卷积神经网络', difficulty: 'advanced', recommended_order: 9, prerequisites: ['pooling_layer'], status: 'published', definition: 'LeNet、AlexNet、VGG、ResNet 的结构演进。' },
        ],
      },
      {
        id: 'transformer',
        course_id: 'deep_learning_001',
        title: '注意力机制与 Transformer',
        description: '自注意力机制和 Transformer 架构',
        order_index: 5,
        concepts: [
          { id: 'self_attention', course_id: 'deep_learning_001', title: '自注意力机制', section_id: 'transformer', section_title: '注意力机制与 Transformer', difficulty: 'advanced', recommended_order: 10, prerequisites: ['backpropagation'], status: 'published', definition: '用 Query、Key、Value 计算序列内部依赖。' },
          { id: 'transformer_architecture', course_id: 'deep_learning_001', title: 'Transformer 架构', section_id: 'transformer', section_title: '注意力机制与 Transformer', difficulty: 'advanced', recommended_order: 11, prerequisites: ['self_attention'], status: 'published', definition: '编码器、解码器、多头注意力和位置编码。' },
        ],
      },
    ],
    unsectioned_concepts: [],
    document_stats: { document_total: 42, chunk_total: 2846, embedding_ready: 42, failed_tasks: 2 },
    chunk_preview: [
      { chunk_id: 'chunk-001', source_title: '深度学习（花书）', page_no: 12, section_path: null, quality: 0.96 },
      { chunk_id: 'chunk-002', source_title: '深度学习（花书）', page_no: 13, section_path: null, quality: 0.94 },
      { chunk_id: 'chunk-003', source_title: '神经网络与深度学习 课程讲义', page_no: 45, section_path: null, quality: 0.92 },
      { chunk_id: 'chunk-004', source_title: '神经网络与深度学习 课程讲义', page_no: 46, section_path: null, quality: 0.91 },
      { chunk_id: 'chunk-005', source_title: 'CNN 结构与实现 课件', page_no: 21, section_path: null, quality: 0.89 },
    ],
  } satisfies CourseBuilderOutline,
  resourceTemplates: [
    { key: 'lecture_pdf', label: '讲义 PDF', icon: 'pdf', color: 'red' },
    { key: 'lab_guide', label: '实验指导', icon: 'beaker', color: 'green' },
    { key: 'question_bank', label: '题库', icon: 'checklist', color: 'blue' },
    { key: 'paper', label: '论文', icon: 'paper', color: 'violet' },
    { key: 'extended', label: '拓展材料', icon: 'folder', color: 'amber' },
  ],
  sourceFilters: ['全部来源', '讲义 PDF', '实验指导', '题库', '论文'],
  uploadHint: '支持拖拽上传，单个文件不超过 500MB',
};
