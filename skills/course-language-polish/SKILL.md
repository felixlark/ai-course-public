---
name: course-language-polish
description: Polish AI course web pages, slide text, and generated lesson copy so it reads for the lecturer and audience rather than exposing the AI/PPT production process. Use when course content contains GPT-style contrast templates, meta copy, generic scaffolding, or phrases such as "不是...而是...".
---

# Course Language Polish

Use this skill before publishing AI Course web pages, PPT text, or generated lesson drafts.

## Goal

Make every learner-facing sentence sound like a lecturer can say it on stage and a reader can understand it on the page.

The output should express:

- A concrete audience question.
- A direct teaching claim.
- A useful example, action, or judgment.
- A clear boundary or takeaway.

The output should not expose:

- How the course was generated, assembled, polished, or packaged.
- Internal labels such as "生产底座", "预制内容", "可组合模块", or "素材重写" in public-facing lesson copy.
- GPT-style contrast scaffolds such as "不是 X，而是 Y" unless the sentence corrects a real learner misconception.

## Rewrite Rules

1. Replace contrast scaffolds with direct claims.
   - Weak: "智能体不是一个名词，而是一套任务循环。"
   - Better: "智能体是一套任务循环：感知任务、调用工具、执行动作、检查结果。"

2. Replace production-process copy with teaching copy.
   - Weak: "这节课负责把主题讲成一个可复用模块。"
   - Better: "这节课帮助听众判断这个主题适用在哪些场景、依赖哪些条件。"

3. Replace generic goals with observable classroom actions.
   - Weak: "目标是把抽象能力落到案例上。"
   - Better: "先交代业务场景，再说明 AI 改变了成本、速度、质量还是风险。"

4. Keep only one main claim per slide or page section.
   - If a sentence contains two or more abstract nouns in a row, split it or anchor it in a case.
   - If a title names only a topic, rewrite it as a conclusion the lecturer can defend.

5. Use negative contrast only for real misconceptions.
   - Acceptable: "大模型会生成流畅答案，但流畅不等于可靠。"
   - Avoid: "这不是一个工具清单，而是一套工作流。"

## Audit Commands

From the project root, run:

```bash
rg -n "不是.{0,40}而是|这节课负责|讲成一个可复用|预制内容|生产底座|目标不是|重写为" docs scripts "课程PPT框架/source" README.md
```

For generated web course content, run the stricter project audit:

```bash
node scripts/audit-course-language.mjs
```

## Acceptance Checklist

- Each course page has a learner-facing problem, explanation, interaction, and takeaway.
- Slide and page titles can be read aloud without sounding like prompt output.
- The text names concrete actors, scenes, tools, risks, or evidence.
- No public-facing course page contains "不是...而是...", "这节课负责", "预制内容", "生产底座", or "目标不是".
- Internal workflow language remains only in README, scripts, or planning documents when it is explicitly about project operation.
