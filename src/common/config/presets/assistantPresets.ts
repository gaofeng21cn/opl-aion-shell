export type AssistantPreset = {
  id: string;
  avatar: string;
  presetAgentType?: string;
  /**
   * Directory containing all resources for this preset (relative to project root).
   * If set, both ruleFiles and skillFiles will be resolved from this directory.
   * Default: rules/ for rules, skills/ for skills
   */
  resourceDir?: string;
  ruleFiles: Record<string, string>;
  skillFiles?: Record<string, string>;
  /**
   * Default enabled skills for this assistant (skill names from skills/ directory).
   * 此助手默认启用的技能列表（来自 skills/ 目录的技能名称）
   */
  defaultEnabledSkills?: string[];
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  promptsI18n?: Record<string, string[]>;
};

export const ASSISTANT_PRESETS: AssistantPreset[] = [
  {
    id: 'one-person-lab',
    avatar: '◉',
    presetAgentType: 'codex',
    resourceDir: 'src/process/resources/assistant/opl-family/one-person-lab',
    ruleFiles: {
      'en-US': 'one-person-lab.md',
      'zh-CN': 'one-person-lab.zh-CN.md',
    },
    defaultEnabledSkills: ['mas', 'mag', 'rca', 'superpowers'],
    nameI18n: {
      'en-US': 'One Person Lab',
      'zh-CN': 'One Person Lab',
    },
    descriptionI18n: {
      'en-US':
        'Use One Person Lab as the Codex-first workbench for routing work to Foundry Agents or OPL Agent development.',
      'zh-CN': '使用 One Person Lab 作为 Codex-first 工作台，用于分派 Foundry Agents 或开发 OPL Agent。',
    },
    promptsI18n: {
      'en-US': [
        'Inspect this workspace and choose between using One Person Lab, managing a Foundry Agent, or developing an OPL Agent.',
        'Continue the active One Person Lab task from the current visible status.',
        'Route this request to the right Foundry Agent while keeping domain truth in that agent.',
      ],
      'zh-CN': [
        '检查当前工作区，并判断这个任务属于使用 One Person Lab、管理 Foundry Agent，还是开发 OPL Agent。',
        '从当前可见状态继续推进活跃的 One Person Lab 任务。',
        '把这个请求路由到合适的 Foundry Agent，同时保持领域真相由该 Agent 持有。',
      ],
    },
  },
  {
    id: 'med-auto-science',
    avatar: 'MAS',
    presetAgentType: 'codex',
    resourceDir: 'src/process/resources/assistant/opl-family/med-auto-science',
    ruleFiles: {
      'en-US': 'med-auto-science.md',
      'zh-CN': 'med-auto-science.zh-CN.md',
    },
    defaultEnabledSkills: ['mas'],
    nameI18n: {
      'en-US': 'Med Auto Science',
      'zh-CN': 'Med Auto Science',
    },
    descriptionI18n: {
      'en-US':
        'Foundry Agent for medical study runtime, paper progress, reviewer revision, and publication supervision.',
      'zh-CN': '医学研究 Foundry Agent，用于研究运行态、论文进度、返修与投稿监督。',
    },
    promptsI18n: {
      'en-US': [
        'Read the current study progress and tell me the next supervised action.',
        'Resume this MAS paper line from durable status without hand-patching outputs.',
        'Audit whether the submission package has reached its milestone gate.',
      ],
      'zh-CN': [
        '读取当前 study progress，并告诉我下一步监督动作。',
        '从 durable status 继续这条 MAS 论文线，不手工 patch 输出物。',
        '审计当前投稿包是否已经达到里程碑门槛。',
      ],
    },
  },
  {
    id: 'med-auto-grant',
    avatar: 'MAG',
    presetAgentType: 'codex',
    resourceDir: 'src/process/resources/assistant/opl-family/med-auto-grant',
    ruleFiles: {
      'en-US': 'med-auto-grant.md',
      'zh-CN': 'med-auto-grant.zh-CN.md',
    },
    defaultEnabledSkills: ['mag'],
    nameI18n: {
      'en-US': 'Med Auto Grant',
      'zh-CN': 'Med Auto Grant',
    },
    descriptionI18n: {
      'en-US': 'Foundry Agent for grant planning, authoring, critique, revision, and package readiness.',
      'zh-CN': '基金申请 Foundry Agent，用于规划、写作、评审、修改与包就绪检查。',
    },
    promptsI18n: {
      'en-US': [
        'Open the current MAG program status and continue the next authoring step.',
        'Turn the reviewer notes into a grant revision action plan.',
        'Check whether this grant package is submission-ready.',
      ],
      'zh-CN': [
        '打开当前 MAG program status，并继续下一步写作。',
        '把评审意见转成基金修改行动计划。',
        '检查这个基金包是否已经 submission-ready。',
      ],
    },
  },
  {
    id: 'redcube-ai',
    avatar: 'RCA',
    presetAgentType: 'codex',
    resourceDir: 'src/process/resources/assistant/opl-family/redcube-ai',
    ruleFiles: {
      'en-US': 'redcube-ai.md',
      'zh-CN': 'redcube-ai.zh-CN.md',
    },
    defaultEnabledSkills: ['rca'],
    nameI18n: {
      'en-US': 'RedCube AI',
      'zh-CN': 'RedCube AI',
    },
    descriptionI18n: {
      'en-US': 'Foundry Agent for slide decks and visual deliverables through the RedCube product runtime.',
      'zh-CN': '视觉交付 Foundry Agent，用于通过 RedCube product runtime 生成幻灯片和视觉交付物。',
    },
    promptsI18n: {
      'en-US': [
        'Create a RedCube deliverable plan from this brief and start the recoverable runtime.',
        'Inspect the current deck task and continue from the latest artifact status.',
        'Run a quality pass on this presentation deliverable.',
      ],
      'zh-CN': [
        '根据这个 brief 创建 RedCube 交付计划，并启动可恢复 runtime。',
        '检查当前 deck 任务，并从最新 artifact 状态继续。',
        '对这个演示交付物做质量检查。',
      ],
    },
  },
  {
    id: 'word-creator',
    avatar: '📝',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/word-creator',
    ruleFiles: {
      'en-US': 'word-creator.md',
      'zh-CN': 'word-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-docx'],
    nameI18n: {
      'en-US': 'Word Creator',
      'zh-CN': 'Word 文档助手',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional Word documents with officecli. Reports, proposals, letters, memos, and more.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 Word 文档。报告、方案、信函、备忘录等。',
    },
    promptsI18n: {
      'en-US': [
        'Create a Q1 2026 quarterly report with TOC, financial highlights table, revenue trend chart, and KPI metrics section',
        'Write an academic research paper on machine learning with LaTeX equations, citations, data tables, and bibliography',
        'Create a project status report with DRAFT watermark, color-coded status table, and a Gantt timeline in landscape section',
      ],
      'zh-CN': [
        '创建一份 2026 年 Q1 季度报告，包含目录、财务亮点表格、营收趋势图和 KPI 指标',
        '写一篇关于机器学习的学术论文，包含 LaTeX 公式、引用、数据表格和参考文献',
        '创建一份项目状态报告，带 DRAFT 水印、彩色状态表格和横向甘特图时间线',
      ],
    },
  },
  {
    id: 'ppt-creator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/ppt-creator',
    ruleFiles: {
      'en-US': 'ppt-creator.md',
      'zh-CN': 'ppt-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-pptx'],
    nameI18n: {
      'en-US': 'PPT Creator',
      'zh-CN': 'PPT 演示助手',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional PowerPoint presentations with officecli. Bold designs, varied layouts, and visual impact.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 PPT 演示文稿。大胆设计、丰富版式、视觉冲击。',
    },
    promptsI18n: {
      'en-US': [
        'Create a 10-slide Kubernetes migration proposal with architecture comparison, cost analysis, and migration timeline',
        'Create a 10-slide SaaS analytics dashboard for a project management tool with user growth charts, conversion funnel, and competitive landscape',
        'Create a 10-slide fintech product roadmap for a digital payment platform with user growth trajectory and investment analysis',
      ],
      'zh-CN': [
        '做一份 10 页的 Kubernetes 迁移方案 PPT，包含架构对比、成本分析和迁移时间线',
        '做一份 10 页的 SaaS 产品数据看板 PPT，包含用户增长图表、转化漏斗和竞品分析',
        '做一份 10 页的金融科技产品路线图 PPT，包含用户增长趋势和投资分析',
      ],
    },
  },
  {
    id: 'excel-creator',
    avatar: '📈',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/excel-creator',
    ruleFiles: {
      'en-US': 'excel-creator.md',
      'zh-CN': 'excel-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-xlsx'],
    nameI18n: {
      'en-US': 'Excel Creator',
      'zh-CN': 'Excel 表格助手',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional Excel spreadsheets with officecli. Financial models, dashboards, trackers, and data analysis.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 Excel 表格。财务模型、数据看板、追踪表和数据分析。',
    },
    promptsI18n: {
      'en-US': [
        'Build a 3-sheet financial dashboard with income statement, revenue breakdown chart, and conditional formatting for variances',
        'Create a sales pipeline tracker with deal stages, weighted pipeline formulas, funnel chart, and rep performance scorecards',
        'Create a budget tracker with cross-sheet variance formulas, budget vs actuals bar chart, and color-coded over-budget highlights',
      ],
      'zh-CN': [
        '创建一个 3 页的财务看板，包含利润表、营收分布图和差异条件格式',
        '创建一个销售管道追踪表，包含阶段统计、加权管道公式、漏斗图和销售代表业绩看板',
        '创建一个预算追踪表，包含跨表差异公式、预算对比柱状图和超支红色高亮',
      ],
    },
  },
  {
    id: 'morph-ppt',
    avatar: '✨',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/morph-ppt',
    ruleFiles: {
      'en-US': 'morph-ppt.md',
      'zh-CN': 'morph-ppt.zh-CN.md',
    },
    defaultEnabledSkills: ['morph-ppt'],
    nameI18n: {
      'en-US': 'Morph PPT',
      'zh-CN': 'Morph PPT',
    },
    descriptionI18n: {
      'en-US':
        'Create professional Morph-animated presentations with officecli. Supports multiple visual styles and end-to-end workflow from topic to polished slides.',
      'zh-CN': '使用 officecli 创建专业的 Morph 动画演示文稿。支持多种视觉风格，从主题到精美幻灯片的端到端工作流。',
    },
    promptsI18n: {
      'en-US': [
        'Pick a fun topic yourself and create a complete PPT',
        'Create the most beautiful PPT you can imagine, topic is up to you',
        'Create a coffee brand introduction PPT with a minimalist premium feel',
      ],
      'zh-CN': [
        '自己想一个有趣的主题，帮我做一份PPT',
        '做一个你认为最好看的 PPT，主题你定',
        '做一份咖啡品牌介绍PPT，要极简高级感',
      ],
    },
  },
  {
    id: 'morph-ppt-3d',
    avatar: '🎬',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/morph-ppt-3d',
    ruleFiles: {
      'en-US': 'morph-ppt-3d.md',
      'zh-CN': 'morph-ppt-3d.zh-CN.md',
    },
    defaultEnabledSkills: ['morph-ppt-3d', 'morph-ppt'],
    nameI18n: {
      'en-US': '3D Morph PPT',
      'zh-CN': '3D Morph PPT',
    },
    descriptionI18n: {
      'en-US':
        "Turn a GLB 3D model into a cinematic Morph presentation. The model is the visual hero — close-up for details, bird's eye for structure, low angle for drama, with smooth Morph transitions between every shot. Note: 3D models and Morph transitions require Microsoft PowerPoint to display correctly.",
      'zh-CN':
        '把 GLB 3D 模型变成电影感 Morph 演示文稿。模型是视觉主角——特写看细节、俯视看结构、仰拍看气势，每页之间用 Morph 转场做流畅的镜头运动。注意：3D 模型和 Morph 转场效果需要在微软 PowerPoint 中打开才能正常显示。',
    },
    promptsI18n: {
      'en-US': [
        "Use this GLB model to create a product showcase. Content should revolve around the model — what it is, its features, its story. Each slide shows a different angle that matches the topic: close-up for details, bird's eye for structure, dramatic low angle for the climax.",
        'Here is my GLB model. Study it carefully, then create a cinematic presentation where the model is the hero of every frame. I want varied camera work: push in for detail shots, pull back for overview, bleed the model off the edge for dramatic transitions.',
        "Build a presentation around this 3D model that feels like a movie trailer. Big dramatic moments, intimate close-ups, sweeping overview shots. The story should match what the model actually is — don't just add generic text.",
      ],
      'zh-CN': [
        '用这个 GLB 模型做一份产品展示 PPT。内容要围绕模型展开——它是什么、有什么特点、背后的故事。每页用不同视角配合主题：讲细节就特写、讲结构就俯视、讲气势就仰拍，画面要丰富有层次。',
        '这是我的 GLB 模型，仔细观察它，然后做一份电影感演示，模型是每一帧的主角。镜头要多变：推近看细节、拉远看全貌、模型出血到画面边缘做冲击转场。内容必须贴合模型本身。',
        '围绕这个 3D 模型做一份像电影预告片一样的演示。要有大气的高潮时刻、细腻的特写镜头、开阔的全景俯瞰。故事要契合模型本身的特征——不要用跟模型无关的通用文案。',
      ],
    },
  },
  {
    id: 'word-form-creator',
    avatar: '📋',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/word-form-creator',
    ruleFiles: {
      'en-US': 'word-form-creator.md',
      'zh-CN': 'word-form-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-word-form'],
    nameI18n: {
      'en-US': 'Word Form Creator',
      'zh-CN': '可填表单助手',
    },
    descriptionI18n: {
      'en-US':
        'Build fillable Word forms (.docx) with real content controls, checkbox fields, MERGEFIELD mail-merge placeholders, and document protection — only designated fields are editable, the rest stays locked. HR intakes, surveys, contract / SOW templates, compliance checklists, medical intake.',
      'zh-CN':
        '制作可填 Word 表单（.docx），支持真正的内容控件、复选框、邮件合并占位符和文档保护——只有指定字段可编辑，其他部分保持锁定。适用于 HR 入职表、问卷、合同 / SOW 模板、合规 checklist、医疗问诊表。',
    },
    promptsI18n: {
      'en-US': [
        'Build a new-hire onboarding .docx form with fields for full name, start date, department, manager, role-based training checklist, and equipment request checkboxes; only the fields are editable.',
        'Create a SOW contract template .docx with mail-merge placeholders for client name, effective date, scope bullets, total fee, and signature blocks; protect everything except the signature area.',
        'Make a medical intake questionnaire .docx with dropdown for reason of visit, text fields for allergies / current medication, checkbox grid for past conditions, and signature line at the bottom.',
      ],
      'zh-CN': [
        '做一份新员工入职登记 .docx 表单，包含姓名、入职日期、部门、直属上级、岗位培训 checklist 和设备申请复选框；其他排版保护，只字段可填。',
        '做一份 SOW 合同模板 .docx，邮件合并占位客户名、生效日期、工作范围 bullets、总费用、签署栏；签名区以外全部保护。',
        '做一份医疗问诊表 .docx，就诊原因下拉、过敏史 / 正在服用药物文本字段、既往病史复选矩阵、末尾签名行。',
      ],
    },
  },
  {
    id: 'pitch-deck-creator',
    avatar: '🎯',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/pitch-deck-creator',
    ruleFiles: {
      'en-US': 'pitch-deck-creator.md',
      'zh-CN': 'pitch-deck-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-pitch-deck'],
    nameI18n: {
      'en-US': 'Pitch Deck Creator',
      'zh-CN': '路演 PPT 助手',
    },
    descriptionI18n: {
      'en-US':
        'Build investor pitch decks, product launch presentations, and enterprise sales decks with gradient designs, data charts, competitive tables, team slides, and speaker notes. Supports seed to Series A+ decks.',
      'zh-CN':
        '制作投资路演、产品发布和企业销售演示文稿，包含渐变设计、数据图表、竞品表格、团队页和演讲者备注。支持从种子轮到 A 轮及以上的路演。',
    },
    promptsI18n: {
      'en-US': [
        'Create a 12-slide Series A investor deck for a B2B SaaS data pipeline startup with ARR charts, competitive comparison table, team avatars, and financial projections',
        'Create an 8-slide product launch deck for an AI code review tool with 5 feature icons, before/after comparison, customer satisfaction doughnut chart, and 3-tier pricing table',
        'Create a 10-slide enterprise sales deck for a cybersecurity platform with ROI analysis, radar chart vs competitors, financial impact table, and implementation timeline',
      ],
      'zh-CN': [
        '为一个 B2B SaaS 数据管道创业公司制作 12 页 A 轮投资路演，包含 ARR 图表、竞品对比表、团队头像和财务预测',
        '为一个 AI 代码审查工具制作 8 页产品发布演示，包含 5 个功能图标、前后对比、客户满意度环形图和 3 档定价表',
        '为一个网络安全平台制作 10 页企业销售演示，包含 ROI 分析、雷达图竞品对比、财务影响表和实施时间线',
      ],
    },
  },
  {
    id: 'dashboard-creator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/dashboard-creator',
    ruleFiles: {
      'en-US': 'dashboard-creator.md',
      'zh-CN': 'dashboard-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-data-dashboard'],
    nameI18n: {
      'en-US': 'Dashboard Creator',
      'zh-CN': '数据仪表盘',
    },
    descriptionI18n: {
      'en-US':
        'Turn CSV or tabular data into polished Excel dashboards with KPI cards, charts linked to live data, sparklines, and conditional formatting. Automatically scales complexity to dataset size — from quick summaries to full analytics panels.',
      'zh-CN':
        '将 CSV 或表格数据转化为精美的 Excel 仪表盘，包含 KPI 卡片、关联实时数据的图表、迷你图和条件格式。根据数据量自动缩放复杂度——从简洁汇总到完整分析面板。',
    },
    promptsI18n: {
      'en-US': [
        'Create a SaaS MRR dashboard with 12 months of sample data — show MRR trend, month-over-month growth, and churn breakdown for a board meeting',
        'Build an e-commerce regional sales dashboard with sample data across 5 regions: revenue by region, weekly trends, and category split',
        'Make a budget-vs-actuals dashboard for 8 departments showing variance indicators and over/under-budget status',
      ],
      'zh-CN': [
        '做一个 SaaS MRR 仪表盘，用 12 个月的示例数据，展示 MRR 趋势、环比增长和流失分析，适合董事会汇报',
        '做一个电商区域销售仪表盘，生成 5 个区域的示例数据，展示按区域收入、周趋势和品类占比',
        '做一个 8 个部门的预算 vs 实际仪表盘，展示偏差指标和超支/节余状态',
      ],
    },
  },
  {
    id: 'academic-paper',
    avatar: '📚',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/academic-paper',
    ruleFiles: {
      'en-US': 'academic-paper.md',
      'zh-CN': 'academic-paper.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-academic-paper'],
    nameI18n: {
      'en-US': 'Academic Paper',
      'zh-CN': '学术论文助手',
    },
    descriptionI18n: {
      'en-US':
        'Create formally structured academic papers, research papers, and white papers with native Word TOC, LaTeX-to-OMML equations, scholarly bibliography (APA/Physics/Chicago), footnotes, multi-column layouts, and paper-type-specific styling.',
      'zh-CN':
        '创建正式结构的学术论文、研究论文和白皮书，支持原生 Word 目录、LaTeX 转 OMML 公式、学术参考文献（APA/物理/芝加哥格式）、脚注、多栏排版和论文类型专属样式。',
    },
    promptsI18n: {
      'en-US': [
        'Create a white paper on rural EV charging infrastructure with executive summary, data tables, footnotes, CONFIDENTIAL watermark, and professional headers',
        'Write a physics paper on topological insulators with display equations, multi-column abstract, theorem/definition blocks, and landscape figures',
        'Create an APA-style research paper on organizational culture with 3 data tables, endnotes, 15 references with hanging indent, and double spacing',
      ],
      'zh-CN': [
        '创建一份农村电动汽车充电基础设施白皮书，包含执行摘要、数据表格、脚注、CONFIDENTIAL 水印和专业页头',
        '写一篇拓扑绝缘体物理论文，包含展示式公式、多栏摘要、定理/定义模块和横向图表',
        '创建一份 APA 格式的组织文化研究论文，包含 3 个数据表格、尾注、15 条挂缩进参考文献和双倍行距',
      ],
    },
  },
  {
    id: 'financial-model-creator',
    avatar: '💰',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/financial-model-creator',
    ruleFiles: {
      'en-US': 'financial-model-creator.md',
      'zh-CN': 'financial-model-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-financial-model'],
    nameI18n: {
      'en-US': 'Financial Model Creator',
      'zh-CN': '财务建模助手',
    },
    descriptionI18n: {
      'en-US':
        'Build formula-driven financial models from text prompts: 3-statement models, DCF valuations, cap tables, scenario analyses, sensitivity tables, and debt schedules. All values flow from assumptions through interconnected formula chains.',
      'zh-CN':
        '根据文本描述构建公式驱动的财务模型：三表联动、DCF 估值、股权表、情景分析、敏感性分析和债务计划。所有数值通过公式链从假设条件层层推导。',
    },
    promptsI18n: {
      'en-US': [
        'Build a 3-year SaaS financial model with income statement, balance sheet, cash flow, and dashboard charts',
        'Create a DCF valuation for a manufacturing company with WACC calculation and sensitivity table',
        'Build a cap table with seed and Series A rounds, liquidation preferences, and exit waterfall analysis',
      ],
      'zh-CN': [
        '搭建一个 3 年期 SaaS 财务模型，包含利润表、资产负债表、现金流量表和看板图表',
        '为制造业公司创建 DCF 估值模型，包含 WACC 计算和敏感性分析表',
        '搭建股权表，包含种子轮和 A 轮融资、清算优先权和退出瀑布分析',
      ],
    },
  },
  {
    id: 'star-office-helper',
    avatar: '📺',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/star-office-helper',
    ruleFiles: {
      'en-US': 'star-office-helper.md',
      'zh-CN': 'star-office-helper.zh-CN.md',
    },
    defaultEnabledSkills: ['star-office-helper'],
    nameI18n: {
      'en-US': 'Star Office Helper',
      'zh-CN': 'Star Office 助手',
    },
    descriptionI18n: {
      'en-US': 'Install, connect, and troubleshoot Star-Office-UI visualization for Aion preview.',
      'zh-CN': '用于在 Aion 预览中安装、连接并排查 Star-Office-UI 可视化问题。',
    },
    promptsI18n: {
      'en-US': [
        'Set up Star Office on my machine',
        'Fix Unauthorized on Star Office page',
        'Connect Aion preview to http://127.0.0.1:19000',
      ],
      'zh-CN': ['帮我安装 Star Office', '排查 Star Office Unauthorized', '把 Aion 预览连接到 http://127.0.0.1:19000'],
    },
  },
  {
    id: 'openclaw-setup',
    avatar: '🦞',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/openclaw-setup',
    ruleFiles: {
      'en-US': 'openclaw-setup.md',
      'zh-CN': 'openclaw-setup.zh-CN.md',
    },
    defaultEnabledSkills: ['openclaw-setup', 'aionui-webui-setup'],
    nameI18n: {
      'en-US': 'OpenClaw Setup Expert',
      'zh-CN': 'OpenClaw 部署专家',
    },
    descriptionI18n: {
      'en-US':
        'Expert guide for installing, deploying, configuring, and troubleshooting OpenClaw. Proactively helps with setup, diagnoses issues, and provides security best practices.',
      'zh-CN': 'OpenClaw 安装、部署、配置和故障排查专家。主动协助设置、诊断问题并提供安全最佳实践。',
    },
    promptsI18n: {
      'en-US': [
        'Help me install OpenClaw step by step',
        "My OpenClaw isn't working, please diagnose the issue",
        'Configure Telegram channel for OpenClaw integration',
      ],
      'zh-CN': ['帮我一步步安装 OpenClaw', '我的 OpenClaw 出问题了，请帮我诊断', '为 OpenClaw 配置 Telegram 渠道'],
    },
  },
  {
    id: 'cowork',
    avatar: 'cowork.svg',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/cowork',
    ruleFiles: {
      'en-US': 'cowork.md',
      'zh-CN': 'cowork.md', // 使用同一个文件，内容已精简 / Use same file, content is simplified
    },
    skillFiles: {
      'en-US': 'cowork-skills.md',
      'zh-CN': 'cowork-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['skill-creator', 'officecli-pptx', 'officecli-docx', 'pdf', 'officecli-xlsx'],
    nameI18n: {
      'en-US': 'Cowork',
      'zh-CN': 'Cowork',
    },
    descriptionI18n: {
      'en-US': 'Autonomous task execution with file operations, document processing, and multi-step workflow planning.',
      'zh-CN': '具有文件操作、文档处理和多步骤工作流规划的自主任务执行助手。',
    },
    promptsI18n: {
      'en-US': [
        'Analyze the current project structure and suggest improvements',
        'Automate the build and deployment process',
        'Extract and summarize key information from all PDF files',
      ],
      'zh-CN': ['分析当前项目结构并建议改进方案', '自动化构建和部署流程', '提取并总结所有 PDF 文件的关键信息'],
    },
  },
  // Deprecated: replaced by ppt-creator (officecli-based)
  // {
  //   id: 'pptx-generator',
  //   avatar: '📊',
  //   presetAgentType: 'gemini',
  //   resourceDir: 'src/process/resources/assistant/pptx-generator',
  //   ruleFiles: {
  //     'en-US': 'pptx-generator.md',
  //     'zh-CN': 'pptx-generator.zh-CN.md',
  //   },
  //   nameI18n: {
  //     'en-US': 'PPTX Generator',
  //     'zh-CN': 'PPTX 生成器',
  //   },
  //   descriptionI18n: {
  //     'en-US': 'Generate local PPTX assets and structure for pptxgenjs.',
  //     'zh-CN': '生成本地 PPTX 资产与结构（pptxgenjs）。',
  //   },
  //   promptsI18n: {
  //     'en-US': [
  //       'Create a professional slide deck about AI trends with 10 slides',
  //       'Generate a quarterly business report presentation',
  //       'Make a product launch presentation with visual elements',
  //     ],
  //     'zh-CN': ['创建一个包含 10 页的专业 AI 趋势幻灯片', '生成季度业务报告演示文稿', '制作包含视觉元素的产品发布演示'],
  //   },
  // },
  // Deprecated: replaced by ppt-creator (officecli-based)
  // {
  //   id: 'pdf-to-ppt',
  //   avatar: '📄',
  //   presetAgentType: 'gemini',
  //   resourceDir: 'src/process/resources/assistant/pdf-to-ppt',
  //   ruleFiles: {
  //     'en-US': 'pdf-to-ppt.md',
  //     'zh-CN': 'pdf-to-ppt.zh-CN.md',
  //   },
  //   nameI18n: {
  //     'en-US': 'PDF to PPT',
  //     'zh-CN': 'PDF 转 PPT',
  //   },
  //   descriptionI18n: {
  //     'en-US': 'Convert PDF to PPT with watermark removal rules.',
  //     'zh-CN': 'PDF 转 PPT 并去除水印规则',
  //   },
  //   promptsI18n: {
  //     'en-US': [
  //       'Convert report.pdf to a PowerPoint presentation',
  //       'Extract all charts and diagrams from whitepaper.pdf',
  //       'Transform this PDF document into slides with proper formatting',
  //     ],
  //     'zh-CN': [
  //       '将 report.pdf 转换为 PowerPoint 演示文稿',
  //       '从白皮书提取所有图表和示意图',
  //       '将此 PDF 文档转换为格式正确的幻灯片',
  //     ],
  //   },
  // },
  {
    id: 'game-3d',
    avatar: '🎮',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/game-3d',
    ruleFiles: {
      'en-US': 'game-3d.md',
      'zh-CN': 'game-3d.zh-CN.md',
    },
    nameI18n: {
      'en-US': '3D Game',
      'zh-CN': '3D 游戏生成',
    },
    descriptionI18n: {
      'en-US': 'Generate a complete 3D platform collection game in one HTML file.',
      'zh-CN': '用单个 HTML 文件生成完整的 3D 平台收集游戏。',
    },
    promptsI18n: {
      'en-US': [
        'Create a 3D platformer game with jumping mechanics',
        'Make a coin collection game with obstacles',
        'Build a 3D maze exploration game',
      ],
      'zh-CN': ['创建一个带跳跃机制的 3D 平台游戏', '制作一个带障碍物的金币收集游戏', '构建一个 3D 迷宫探索游戏'],
    },
  },
  {
    id: 'ui-ux-pro-max',
    avatar: '🎨',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/ui-ux-pro-max',
    ruleFiles: {
      'en-US': 'ui-ux-pro-max.md',
      'zh-CN': 'ui-ux-pro-max.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'UI/UX Pro Max',
      'zh-CN': 'UI/UX 专业设计师',
    },
    descriptionI18n: {
      'en-US':
        'Professional UI/UX design intelligence with 57 styles, 95 color palettes, 56 font pairings, and stack-specific best practices.',
      'zh-CN': '专业 UI/UX 设计智能助手，包含 57 种风格、95 个配色方案、56 个字体配对及技术栈最佳实践。',
    },
    promptsI18n: {
      'en-US': [
        'Design a modern login page for a fintech mobile app',
        'Create a color palette for a nature-themed website',
        'Design a dashboard interface for a SaaS product',
      ],
      'zh-CN': ['为金融科技移动应用设计现代登录页', '创建自然主题网站的配色方案', '为 SaaS 产品设计仪表板界面'],
    },
  },
  {
    id: 'planning-with-files',
    avatar: '📋',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/planning-with-files',
    ruleFiles: {
      'en-US': 'planning-with-files.md',
      'zh-CN': 'planning-with-files.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Planning with Files',
      'zh-CN': '文件规划助手',
    },
    descriptionI18n: {
      'en-US':
        'Manus-style file-based planning for complex tasks. Uses task_plan.md, findings.md, and progress.md to maintain persistent context.',
      'zh-CN': 'Manus 风格的文件规划，用于复杂任务。使用 task_plan.md、findings.md 和 progress.md 维护持久化上下文。',
    },
    promptsI18n: {
      'en-US': [
        'Plan a comprehensive refactoring task with milestones',
        'Break down the feature implementation into actionable steps',
        'Create a project plan for migrating to a new framework',
      ],
      'zh-CN': ['规划一个包含里程碑的全面重构任务', '将功能实现拆分为可执行的步骤', '创建迁移到新框架的项目计划'],
    },
  },
  {
    id: 'human-3-coach',
    avatar: '🧭',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/human-3-coach',
    ruleFiles: {
      'en-US': 'human-3-coach.md',
      'zh-CN': 'human-3-coach.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'HUMAN 3.0 Coach',
      'zh-CN': 'HUMAN 3.0 教练',
    },
    descriptionI18n: {
      'en-US':
        'Personal development coach based on HUMAN 3.0 framework: 4 Quadrants (Mind/Body/Spirit/Vocation), 3 Levels, 3 Growth Phases.',
      'zh-CN': '基于 HUMAN 3.0 框架的个人发展教练：4 象限（思维/身体/精神/职业）、3 层次、3 成长阶段。',
    },
    promptsI18n: {
      'en-US': [
        'Help me set quarterly goals across all life quadrants',
        'Reflect on my career progress and plan next steps',
        'Create a personal development plan for the next 3 months',
      ],
      'zh-CN': [
        '帮我设定涵盖所有生活象限的季度目标',
        '反思我的职业发展进度并规划下一步',
        '为未来 3 个月创建个人发展计划',
      ],
    },
  },
  {
    id: 'social-job-publisher',
    avatar: '📣',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/social-job-publisher',
    ruleFiles: {
      'en-US': 'social-job-publisher.md',
      'zh-CN': 'social-job-publisher.zh-CN.md',
    },
    skillFiles: {
      'en-US': 'social-job-publisher-skills.md',
      'zh-CN': 'social-job-publisher-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['xiaohongshu-recruiter', 'x-recruiter'],
    nameI18n: {
      'en-US': 'Social Job Publisher',
      'zh-CN': '社交招聘发布助手',
    },
    descriptionI18n: {
      'en-US': 'Expand hiring requests into a full JD, images, and publish to social platforms via connectors.',
      'zh-CN': '扩写招聘需求为完整 JD 与图片，并通过 connector 发布到社交平台。',
    },
    promptsI18n: {
      'en-US': [
        'Create a comprehensive job post for Senior Full-Stack Engineer',
        'Draft an engaging hiring tweet for social media',
        'Create a multi-platform job posting (LinkedIn, X, Redbook)',
      ],
      'zh-CN': [
        '创建一份高级全栈工程师的完整招聘启事',
        '起草一条适合社交媒体的招聘推文',
        '创建多平台职位发布（LinkedIn、X、小红书）',
      ],
    },
  },
  {
    id: 'moltbook',
    avatar: '🦞',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/moltbook',
    ruleFiles: {
      'en-US': 'moltbook.md',
      'zh-CN': 'moltbook.md',
    },
    skillFiles: {
      'en-US': 'moltbook-skills.md',
      'zh-CN': 'moltbook-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['moltbook'],
    nameI18n: {
      'en-US': 'moltbook',
      'zh-CN': 'moltbook',
    },
    descriptionI18n: {
      'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.',
      'zh-CN': 'AI 代理的社交网络。发帖、评论、投票、创建社区。',
    },
    promptsI18n: {
      'en-US': [
        'Check my moltbook feed for latest updates',
        'Post an interesting update to moltbook',
        'Check for new direct messages',
      ],
      'zh-CN': ['查看我的 moltbook 最新动态', '在 moltbook 发布一条有趣的动态', '检查是否有新私信'],
    },
  },
  {
    id: 'story-roleplay',
    avatar: '📖',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/story-roleplay',
    ruleFiles: {
      'en-US': 'story-roleplay.md',
      'zh-CN': 'story-roleplay.zh-CN.md',
    },
    defaultEnabledSkills: ['story-roleplay'],
    nameI18n: {
      'en-US': 'Story Roleplay',
      'zh-CN': '故事角色扮演',
    },
    descriptionI18n: {
      'en-US':
        'Immersive story roleplay. Start by: 1) Natural language to create characters, 2) Paste PNG images, or 3) Open folder with character cards (PNG/JSON) and world info.',
      'zh-CN':
        '沉浸式故事角色扮演。三种开始方式：1) 自然语言直接对话创建角色，2) 直接粘贴PNG图片，3) 打开包含角色卡（PNG/JSON）和世界书的文件夹。',
    },
    promptsI18n: {
      'en-US': [
        'Start an epic fantasy adventure with a brave warrior',
        'Create a detailed character with backstory and personality',
        'Begin an interactive story in a sci-fi setting',
      ],
      'zh-CN': ['开始一个勇敢战士的史诗奇幻冒险', '创建一个有背景故事和个性的详细角色', '在科幻设定中开始一个互动故事'],
    },
  },
];
