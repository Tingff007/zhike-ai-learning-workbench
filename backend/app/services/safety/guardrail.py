import re


class SafetyGuardrail:
    """对用户输入和模型输出执行基础安全规则检查。

    该服务通过固定关键词和正则模式识别考试作弊、敏感凭据泄露等风险。
    规则命中仅影响本服务返回的布尔值或状态字典，不会修改外部存储。
    """

    INPUT_BLOCKED_KEYWORDS = ["代考", "作弊", "泄露密钥", "代写论文", "买卖答案"]
    OUTPUT_BLOCKED_PATTERNS = [
        re.compile(r"(?i)sk-[a-z0-9]{20,}"),
        re.compile(r"(?i)api[_-]?key\s*[:=]\s*['\"]?[a-z0-9]{16,}"),
        re.compile(r"(?i)(password|passwd|secret)\s*[:=]\s*\S{6,}"),
        re.compile(r"BEGIN (RSA |OPENSSH )?PRIVATE KEY"),
    ]
    OUTPUT_WARNING_KEYWORDS = ["绕过审核", "攻击服务器", "删除数据库"]

    def check_user_input(self, text: str) -> bool:
        """检查用户输入是否通过基础安全关键词规则。

        参数:
            text: 待检查的用户输入文本，允许传入空字符串。

        返回:
            如果未命中禁止关键词则返回 True，否则返回 False。

        副作用与失败模式:
            本方法不产生副作用；空值会按空字符串处理，不抛出异常。
        """

        lowered = (text or "").lower()
        return not any(keyword in lowered for keyword in self.INPUT_BLOCKED_KEYWORDS)

    def check_output(self, text: str) -> dict:
        """检查模型输出是否包含敏感凭据或高风险表述。

        参数:
            text: 待检查的模型输出文本，允许传入空字符串。

        返回:
            包含 status 与 flags 的字典。status 可能为 passed、warning 或 blocked；
            flags 记录命中的风险规则。

        副作用与失败模式:
            本方法不产生副作用；空值会按空字符串处理，不抛出异常。
        """

        content = text or ""
        flags: list[str] = []
        for pattern in self.OUTPUT_BLOCKED_PATTERNS:
            if pattern.search(content):
                flags.append("sensitive_credential_pattern")
        for keyword in self.OUTPUT_WARNING_KEYWORDS:
            if keyword in content:
                flags.append(f"warning:{keyword}")
        if flags and any(flag == "sensitive_credential_pattern" for flag in flags):
            return {"status": "blocked", "flags": flags}
        if flags:
            return {"status": "warning", "flags": flags}
        return {"status": "passed", "flags": []}

    def sanitize_output(self, text: str) -> str:
        """根据安全检查结果返回可展示的输出文本。

        参数:
            text: 原始模型输出文本。

        返回:
            如果命中阻断规则则返回固定拦截提示；如果命中警告规则则追加系统提示；
            否则返回原始文本。

        副作用与失败模式:
            本方法不产生副作用；内部依赖 check_output 的规则结果。
        """

        result = self.check_output(text)
        if result["status"] == "blocked":
            return "检测到回答中可能包含敏感凭据或不当内容，已拦截。请仅讨论课程学习相关问题。"
        if result["status"] == "warning":
            return f"{text}\n\n（系统提示：请避免讨论高风险或违规操作。）"
        return text
