# 上游 Skill 续接协议

这是一份面向任意上游 Skill 的能力交接协议。它只负责让当前 Agent 保留必要状态并继续使用 `wechat-layout-publisher`，不要求用户复制模板，也不要求上游复述下游制作步骤。

## 进入条件

只有同时满足以下条件时才交接：

1. 用户请求、平台选择或可追溯任务状态已经确认 `destination: wechat_official_account`。
2. 上游已经产出可读取的资料或文章。
3. 当前流程已经进入公众号制作交付阶段，下一步是定稿、配图、排版、正式可复制版或加入草稿箱。

以下情况保持在上游流程：其他发布平台、平台待定、只写正文、只要初稿、用户明确要求暂不排版。

## 最小交接对象

```yaml
handoff_version: 1
target_capability: wechat_article_production
destination: wechat_official_account
entry_mode: skill_handoff
source_skill: <任意上游 Skill 名称>
source_artifact: <资料或文章绝对路径>
source_status: messy_materials | draft_copy | final_copy
next_action: wechat_production
assets: [<相关素材绝对路径>]
```

字段规则：

- `source_skill` 只记录来源，不限制允许接入的 Skill。
- `source_artifact` 必须可读取。兼容旧字段 `source_article`。
- `source_status` 只描述当前内容成熟度，不代表用户已经选择本 Skill 的内容处理模式。
- `content_choice` 与 `delivery_choice` 仅在用户已经明确选择时附带；未确认就省略，由目标 Skill 一次询问缺失项。传递选择时同时传 `interaction_contract_version: 2` 与 `choice_source: upstream_user_confirmation`。
- `content_choice` 只能是 `A | B | C`，分别表示杂乱资料、初稿文案、发布定稿；`delivery_choice` 只能是 `A | B`。上游不得根据 `source_status` 自动补写选择。
- `assets` 只放与当前公众号内容相关的素材；没有素材时使用空数组。

## 上游 Skill 的最小适配规则

支持多平台的上游 Skill 只需加入一条条件路由：

```text
当且仅当 destination 已确认是 wechat_official_account，且流程进入公众号制作交付阶段时，
把当前产物按上方协议续接给 wechat_article_production 能力。
其他平台、平台待定、只写正文或用户要求暂不排版时，不续接。
```

上游完成交接后停止执行公众号配图、排版和草稿箱步骤，由目标 Skill 接管，避免两套规则同时修改同一份成品。
