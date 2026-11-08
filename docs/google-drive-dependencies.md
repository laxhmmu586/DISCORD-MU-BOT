# Google 依赖清单（2.1.6 更新）

按最新要求移除的关联：

| 功能 | 当前实现 |
|---|---|
| 完整当天 eTerm 日志 | 客户端读本地日志；Oracle 仅提供当天 SQLite SY/BND，不下载 Drive 全量日志。 |
| 历史航班日志 | 客户端读 History Flight Files；移除历史 Drive 下载。 |
| CBS 自动 PNR / Ticket 导入 | 移除 Drive 扫描和自动导入；已有案件内容、手工录入不删除。 |
| SY Bag / Rush / Not Load、Bag Room | 使用 SY/BND 袋数、重量、BN 汇总；没有的标签、备注不伪造，不回退旧表。 |
| FSC 旧表回写 | 移除 Sheets 配置和写操作，保留本地解析及现有手工汇率。 |
| SY 订座数旧 Briefing 回写 | 移除 Sheets 配置和写操作，Briefing 读当天 SY SQLite。 |
| Record Scan | 保存到 boarding SQLite 的 record_scans，保留航班隔离及重复 BN 检查，与 BAB 每日清理。 |
| IRR / Record Case | 已退役，兼容入口不访问 Google。 |
| GD 检查 | 只校验本地声明文本的航班、日期、机号、机组护照，不查 Gmail。 |
| NEXTDAY 检查 | 检查本地次日 SY 和完整 JCSY，不查已发邮件。 |
| Meal Order 检查 | 检查明确的本地订单和 F/J/Y 计数，严格匹配航班日期，不查 Gmail。 |

仍保留的 Drive / Sheets 依赖：

1. **Sales Report** 原始文件、元数据、下载，以及 Sales Details 来源表导入，按要求保留。
2. 在线 Notes 的 Drive JSON 同步。
3. Bag Room 卸载提醒的 Drive JSON 去重状态，不是已移除的报告来源表。
4. CBS Baggage Chart 图片、Open Bag Authorization PDF 模板。
5. PBB Checklist 完成 PDF 归档。
6. Briefing 完成报告 PDF 归档。

CBS、Baggage、Contact Form 默认使用 CBS SQLite；显式 CBS_STORAGE=sheets 的兼容模式仍存在。Report Center 保存记录和 Schedule 为 SQLite。旧 Schedule Sheets／Briefing Sheets PDF 工具不在当前定时业务路径中。

Firebase 员工登录、令牌验证、移动推送 FCM 和其他 Gmail 邮件业务仍保留。GD/NEXTDAY/Meal Order 的检查不再请求 Gmail；用户明确点击 NEXTDAY 发送时，客户端重读本地 SY/JCSY，仅通过设备签名发送汇总数字，不上传全量日志。本地有数据不等于邮件已发送。

本地目录若选在 Google Drive for desktop 同步盘中，文件仍可能由 Drive 同步；移除 API 关联不会自动移动或关闭用户的同步目录。
