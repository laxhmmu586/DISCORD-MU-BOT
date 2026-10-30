# 2026 Jet Bridge 模板核对

本次使用用户提供的 Arrival JB CHECKLIST 2026.pdf、Departure JB Checklist  2026.pdf 原页作为生成底稿，保留原文、表格、顺序、颜色、重复行及页脚，并替换为用户提供的 Hallmark JPG logo。数据、勾选和两位员工签名叠加在原页的空白位置。原操作问题和 Ready/移动/停放/签名流程不变。

## Arrival

| PDF 项目 | 对应依据 | 处理 |
|---|---|---|
| PRE-MOVEMENT 1: 双方到达 gate 并准备操作 | Confirm Gate 保存的 gateConfirmedAt | 有确认记录才勾选；按用户指定，不增加问题 |
| PRE-MOVEMENT 2: operational/serviceable | driver.serviceable | 原答案 |
| PRE-MOVEMENT 3: control panel | driver.controls | 原答案 |
| PRE-MOVEMENT 4: canopy, bumpers, rollers, safety shoe, safety chain | 原 equipment 问题写的是 roller door，并未明确确认 rollers | 整个复合声明留空，不能把 roller door 视为 rollers |
| PRE-MOVEMENT 5: power cables stowed | spotter.cables | 原答案 |
| PRE-MOVEMENT 6: stand free of FOD/obstructions | spotter.stand | 原答案 |
| PRE-MOVEMENT 7: positive communication | Driver 或 Spotter 已进入 Ready 确认/等待状态 | 按用户指定的现有通信流程对应，不增加问题 |
| PRE-MOVEMENT 8: personnel-free / EK only | 记录所属 Account | 仅 EK 自动勾选；MU、CI 等留空，不看航班号前缀 |
| READY: communication established and confirmed | Driver 和 Spotter 都 Ready | 两者都确认才勾选 |
| SAFE 1–3: aircraft stop / chocks / clear path | spotter.stopped / chocks / path | 保留三个独立 PDF 勾选；原 UI 合并 stop/chocks 的保存逻辑不变 |
| SAFE 4、5: spotter verified all safety conditions | Spotter Ready | 附件里这句重复两次，按原稿保留；对应同一个已记录确认，不虚构两次操作 |
| GO 1、2: received authorization / acknowledged | movingAt + 对应角色 Ready | 保留原移动授权依据 |
| MOVEMENT: floor below door sill | driver.floor | 原答案 |
| POST-DOCKING: crew / shoe / auto-leveler / canopy | driver.crew / shoe / leveler / canopy | 按原 PDF 的顺序排列，保留完整原文 |

旧记录没有 Gate 确认时间时不反推。未完成记录在员工重新确认 Gate 后再次打开，会保存该 Gate 确认时间；重置同一 gate 的检查时保留 Gate 确认，清除 Ready 和检查答案。

## Departure：保持原流程，列出差异

| PDF 位置 | 模板要求 | 现有依据 / 差异 | PDF 处理 |
|---|---|---|---|
| READY 1 | aircraft door closed + safety strap/roller doors secured | d1 aircraft door + d3 safety chain；按用户确认的安全链/通道固定对应 | 两项都 YES 才勾选 |
| READY 2 | path clear of all personnel before movement | 按用户指定：Spotter 和 Driver 都 Ready 后点击 Start，记录 movingAt | 按本次移动开始事件勾选 |
| READY 3 | remove/store safety shoe | d2 | 按原答案 |
| READY 4 | EK only: area free of personnel / sole individual | Account = EK | EK 自动勾选，其他账号留空 |
| SAFE 1 | Auto Off-Level on + canopy fully retracted | 用户确认本次 Departure 的 d4（key to OPERATE + retract canopy）作为合并确认；不引用 Arrival 答案 | d4 为 YES 才勾选 |
| SAFE 2 | all aircraft service cables disconnected + Spotter clearance | Ready/移动流程覆盖许可，但没有电缆断开的明确答案 | 留空（部分覆盖） |
| SAFE 3 | local departure process (bell / thumbs-up) completed | 按用户指定：Spotter 和 Driver 都 Ready 后点击 Start，记录 movingAt | 按本次移动开始事件勾选 |
| GO 1 | Spotter in position and actively observing detachment | d6 的一般安全确认不明确记录位置和持续观察 | 留空 |
| GO 2 | safely parked in safety zone, wheels within stow box | 现有 returned-to-box / dockedAt | 原停放完成后勾选 |
| GO 3 | power off after parking | d11: key OFF/remove；受 after-parking 阶段限制 | 按原答案 |
| GO 4 | sterile-area ramp/terminal access doors secured/locked | 按用户指定：d3 安全链拉好并固定 | 按原答案 |
| GO 5 | final complete-checks / detached, stowed, secured attestation | 现有完成签名不能补足上述未明确确认的子条件 | 留空（部分覆盖） |

按用户指定的 Gate、Ready/Start 和安全链对应关系，READY 1、2，SAFE 3，GO 4 已有对应。SAFE 1 由用户指定本次 Departure 的 d4 作为合并确认。尚未完整对应的是 **3 条**：SAFE 2（电缆断开）、GO 1（Spotter 就位并持续观察）、GO 5（最终完整声明）。本次不新增问题；没有对应依据的声明保持空白。

## 抬头和留存

- 日期、航班、Gate、所选 L1/L2/L3 和签名来自当前记录。
- 当前操作流程没有采集 aircraft Block Time / Off Block Time；相应格子保持空白，不拿 jet bridge movingAt 代替飞机靠离桥时间。生成器可呈现已有记录中的 blockTime 值，但本次不新增输入。
- NO 的照片/原因仍附在后续问题报告页；审计 JSON 继续随 PDF 附加，新增模板版本、各勾选依据及 EK 自动规则。
- PDF 原页只有姓名/签名；原先另印的工牌、证照、时间戳、Record ID 等仍保留在审计 JSON 中。
- 不回写既有已归档 PDF，不改变原清理/留存机制，不发送真实通知。

## Request New Access

新表单只要求 Employee name、Station、Account、HALLMARK EMAIL or preferred username。新申请不再要求 EID；既有含 EID 的历史申请可继续查看。服务端允许有效邮箱或 1–100 字符的账号名（字母/数字开头，后续可用字母、数字、点、下划线、加号、连字符）。Main Account 范围、Business Manager 提交权限、Lake 审批和申请人 Complete 流程保持不变。

## 验证

使用虚构的 ZZ000 / Gate 999 / EXAMPLE DRIVER / EXAMPLE SPOTTER 生成两份示例。逐页渲染并检查：原 PDF 全文保留、logo 完整、表格无重排、L2 圈选和签名不遮挡原文。Arrival 示例使用 MU，EK only 空白；Departure 示例使用 EK，EK only 勾选。未覆盖的声明保持空白。示例加注 SAMPLE ONLY，不作为运营记录。

NO 问题报告邮件及 Driver 先签名的等待状态见 [问题邮件与签名说明](has-pbb-problem-mail.md)。
