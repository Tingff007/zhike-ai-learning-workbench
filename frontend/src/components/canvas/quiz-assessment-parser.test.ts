import { describe, expect, it } from 'vitest';
import { parseQuizAssessmentMarkdown } from './quiz-assessment-parser';

describe('parseQuizAssessmentMarkdown', (): void => {
  it('把阶段测评 Markdown 解析为可作答题目和评分依据', (): void => {
    const markdown = `
# 阶段测评题：深度学习基础

## 选择题（每题2分，共4分）
1. 在深度学习中，以下哪个不是卷积神经网络（CNN）的特点？ A. 使用卷积核提取局部特征 B. 通过全连接层处理图像数据 C. 使用全连接层进行特征提取 D. 自动求梯度优化模型参数
2. 深度学习模型训练时，以下哪个步骤不是必要的？ A. 定义网络结构 B. 计算损失函数 C. 调整网络权重 D. 应用反向传播算法

## 填空题（每题2分，共2分）
1. 在深度学习中，卷积神经网络（CNN）通常包含______层。

## 简答题（每题5分，共5分）
1. 描述卷积神经网络（CNN）的基本工作原理。

## 参考答案
选择题：1. B 2. D
填空题：1. 卷积
简答题：1. 应包含局部感受野、卷积核、特征提取和分类输出。

## 评分要点
选择题：1. 能识别 CNN 的核心机制；2. 能区分训练流程必要步骤。
填空题：1. 填写卷积层或同义表达。
简答题：1. 覆盖卷积核；说明特征提取；提到分类输出。
`;

    const parsed = parseQuizAssessmentMarkdown(markdown, '阶段测评题');

    expect(parsed.title).toBe('阶段测评题：深度学习基础');
    expect(parsed.questions).toHaveLength(4);
    expect(parsed.hasAutoScoringBasis).toBe(true);
    expect(parsed.totalPoints).toBe(11);
    expect(parsed.questions[0]).toMatchObject({
      type: 'single_choice',
      prompt: '在深度学习中，以下哪个不是卷积神经网络（CNN）的特点？',
      expectedAnswer: 'B',
      points: 2,
    });
    expect(parsed.questions[0].options.map((option) => option.value)).toEqual(['A', 'B', 'C', 'D']);
    expect(parsed.questions[2]).toMatchObject({
      type: 'blank',
      expectedAnswer: '卷积',
    });
    expect(parsed.questions[3].scoringPoints).toContain('覆盖卷积核');
  });

  it('缺少参考答案时阻止可靠自动评分', (): void => {
    const parsed = parseQuizAssessmentMarkdown(`
# 阶段测评题
## 选择题
1. 哪个选项正确？ A. 选项一 B. 选项二
`);

    expect(parsed.questions).toHaveLength(1);
    expect(parsed.hasAutoScoringBasis).toBe(false);
    expect(parsed.warnings[0]).toContain('缺少参考答案或评分要点');
  });
});
