# -*- coding: utf-8 -*-
"""基座模型（Qwen2.5-7B-Instruct，无 LoRA）回答质量评测脚本
对比基座模型和微调模型的回答质量差异。
"""
import json
import os
import time
import urllib.request
import urllib.error

# 推理服务地址（可用环境变量 LORA_BASE_URL 覆盖，默认本机）
BASE_URL = os.environ.get("LORA_BASE_URL", "http://127.0.0.1:8002/v1")

# 与 LoRA 评测相同的测试题集
TEST_QUESTIONS = [
    {"id": "ml-01", "category": "机器学习", "question": "什么是过拟合？如何防止过拟合？"},
    {"id": "ml-02", "category": "机器学习", "question": "请解释决策树的基本原理。什么是信息增益？"},
    {"id": "ml-03", "category": "机器学习", "question": "支持向量机（SVM）的核心思想是什么？什么是核技巧？"},
    {"id": "ml-04", "category": "机器学习", "question": "请解释什么是集成学习，Boosting 和 Bagging 有什么区别？"},
    {"id": "sl-01", "category": "统计学习", "question": "什么是统计学习的三要素？请解释模型、策略和算法的关系。"},
    {"id": "sl-02", "category": "统计学习", "question": "请解释朴素贝叶斯分类器的基本原理。什么是朴素假设？"},
    {"id": "sl-03", "category": "统计学习", "question": "什么是 EM 算法？它主要解决什么问题？"},
    {"id": "dl-01", "category": "深度学习", "question": "什么是反向传播算法？请解释它的计算过程。"},
    {"id": "dl-02", "category": "深度学习", "question": "请解释梯度消失和梯度爆炸问题。如何解决？"},
    {"id": "dl-03", "category": "深度学习", "question": "什么是批归一化（Batch Normalization）？它解决了什么问题？"},
    {"id": "dl-04", "category": "深度学习", "question": "请比较 Adam 和 SGD 优化器的区别。"},
    {"id": "pyt-01", "category": "PyTorch实践", "question": "PyTorch 中 Dataset 和 DataLoader 的作用是什么？"},
    {"id": "pyt-02", "category": "PyTorch实践", "question": "什么是 autograd？PyTorch 中如何实现自动微分？"},
    {"id": "pyt-03", "category": "PyTorch实践", "question": "在 PyTorch 中，model.train() 和 model.eval() 有什么区别？"},
    {"id": "prml-01", "category": "模式识别", "question": "请解释贝叶斯决策理论的基本思想。"},
    {"id": "prml-02", "category": "模式识别", "question": "什么是维数灾难（Curse of Dimensionality）？它如何影响机器学习？"},
    {"id": "prml-03", "category": "模式识别", "question": "请解释主成分分析（PCA）的原理和应用。"},
]


def call_base(question, temperature=0.1, max_tokens=300):
    """调用基座模型（无 LoRA）"""
    payload = {
        "model": "qwen2.5-7b-base",
        "messages": [{"role": "user", "content": question}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/base/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - start
        answer = result["choices"][0]["message"]["content"]
        usage = result.get("usage", {})
        return {
            "success": True,
            "answer": answer,
            "latency_s": round(elapsed, 2),
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }
    except Exception as e:
        elapsed = time.time() - start
        return {"success": False, "error": str(e), "latency_s": round(elapsed, 2)}


def main():
    print("=" * 60)
    print("基座模型（Qwen2.5-7B-Instruct）回答质量评测")
    print(f"共 {len(TEST_QUESTIONS)} 道题")
    print("=" * 60)

    all_results = []
    for i, q in enumerate(TEST_QUESTIONS, 1):
        print(f"\n[{i}/{len(TEST_QUESTIONS)}] {q['category']}: {q['question'][:50]}...")
        result = call_base(q["question"])
        result["question_id"] = q["id"]
        result["category"] = q["category"]
        result["question"] = q["question"]
        all_results.append(result)

        if result["success"]:
            print(f"  [OK] 回答成功 | 耗时: {result['latency_s']:.1f}s | tokens: {result['total_tokens']}")
            print(f"  回答: {result['answer'][:120]}...")
        else:
            print(f"  [FAIL] 失败: {result.get('error', '')}")
        time.sleep(1)

    # 汇总
    print("\n" + "=" * 60)
    print("评测汇总")
    print("=" * 60)
    success = [r for r in all_results if r["success"]]
    fail = [r for r in all_results if not r["success"]]
    print(f"成功: {len(success)}/{len(all_results)}")
    if fail:
        print(f"失败: {len(fail)} 条")
        for f in fail:
            print(f"  - {f['question_id']}: {f.get('error', '')}")

    if success:
        avg_latency = sum(r["latency_s"] for r in success) / len(success)
        avg_tokens = sum(r["total_tokens"] for r in success) / len(success)
        avg_speed = sum(r["completion_tokens"] / r["latency_s"] for r in success if r["latency_s"] > 0) / len(success)
        print(f"平均响应时间: {avg_latency:.1f}s")
        print(f"平均总 tokens: {avg_tokens:.0f}")
        print(f"平均生成速度: {avg_speed:.1f} tokens/s")

    # 保存结果
    output = {
        "model": "qwen2.5-7b-base",
        "test_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_questions": len(TEST_QUESTIONS),
        "success_count": len(success),
        "fail_count": len(fail),
        "avg_latency_s": round(avg_latency, 2) if success else None,
        "avg_total_tokens": round(avg_tokens, 1) if success else None,
        "avg_speed_tokens_per_s": round(avg_speed, 1) if success else None,
        "results": all_results,
    }
    output_path = r"E:\testing\微调评估\base_eval_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到: {output_path}")


if __name__ == "__main__":
    main()