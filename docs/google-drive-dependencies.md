# Google Drive / Sheets 依赖清单

核对范围：当前仓库的服务调用、SQLite 路由适配器、2.1.4 安装包中的本地服务，以及 Oracle 当前 main 源码。文件叫 `googleDrive.js` 不代表其所有功能仍使用 Drive；下面区分 Drive 文件、Sheets 表格、SQLite 和 Gmail。

## 本次变更后仍依赖 Drive / Sheets 的业务

| 功能 | 依赖与用途 | 主要源码 |
|---|---|---|
| **Sales Report 原始文件、元数据、下载** | Drive 搜索及下载；按用户要求保留 | `googleDrive.js`: `findSalesReportFile`, `getSalesReportMeta`, `downloadSalesReportByFlight` |
| Sales Details 来源导入 | Sheets 的销售日报明细表导入；查询缓存已经在 Report SQLite | `readSalesReportSourceValues`, `syncSalesDetailsFromSourceSheet`, `reportSqlite.js` |
| 完整当天 eTerm 日志的旧在线分析 | Drive TODAY 文件夹；历史、完整报告生成、部分 Gmail 比较／次日准备仍会走这条路径。本次没有声称所有日志均已脱离 Drive | `getLatestFlightLog`, `index.js` 的 `/search` 及后台报告扫描 |
| 历史航班日志 | Drive 历史文件夹；本地客户端可读用户选择的历史文件夹 | `getFlightLogByDate`, `src/log-store.js`（安装包） |
| CBS 按行李号查找 PNR / Ticket 记录 | Drive 当天及历史 Record 文件夹，读取文本／Docs／Sheets 导出 | `findCbsPnrRecordsByBagTag` |
| 在线 Notes 同步 | Drive JSON 文件；客户端另有随包的 notes store，并非所有 Notes 调用都已改成本地 | `readNotesDriveStore`, `writeNotesDriveStore`, `index.js` Notes 存储包装 |
| Bag Room 卸载提醒去重状态 | Drive JSON 文件；Gmail 发信／查已发件是另一项 Google 依赖 | `readBagRoomUnloadAlertState`, `writeBagRoomUnloadAlertState` |
| SY 页 Bag/Rush/Not Load 辅助表及 Bag Room 报告来源 | Google Sheets，**不同于本次迁移的 SY/BND 终端记录** | `getSyBagSheetRows`, `getSyBagInfoByDate` |
| FSC 汇率向旧表回写 | Sheets 指定单元格 | `updateFscExchangeRate`, `index.js` 延迟同步 |
| SY 订座数向旧 Briefing 表回写 | Sheets F/J/Y 区域；读取当天航班和 PBB Gate 已改为 boarding SQLite | `updateSyBookingCounts` |
| Record Scan | Sheets 的 Record Scan 页；不要与已迁移的 BAB / Emergency Boarding 混淆 | `appendRecordScanRecord`, `index.js` `/record-scan` 路径 |
| IRR / Record Case 工作流 | Sheets 旅客记录、更新、酒店及工作流字段 | `getRecordCases`, `appendRecordCase`, `updateRecordCase`, `irr.js` |
| CBS Baggage Chart 图片 | Drive 搜索、下载行李图 | `getCbsBaggageChartImage` |
| CBS Open Bag Authorization 模板 | Drive 下载授权 PDF | `getCbsOpenBagAuthorizationPdf` |
| PBB Checklist 完成 PDF 归档 | Drive 上传、重试与文件链接；记录本身仍有数据库 | `has/server/pbb.js`, `pbbDrive.js` |
| Briefing 报告归档 | Drive 上传已生成的 PDF；记录和归档任务在 SQLite | `briefingAutoArchive.js`, `has/server/briefingDrive.js` |

## 已迁移或旧兼容代码：不能误报成当前常规 Drive 读写

| 功能 | 当前状态 |
|---|---|
| 当天 SY/BND、GATE/BDT/ETD、BOX、航班选择列表 | 本 PR 改为 `boarding.db` 的 `flight_day_sections`，由批准客户端发布；与 BAB 每日 07:00 一起清理。需要部署后端并连接新客户端后生效。 |
| BAB、Emergency Boarding、NBRD、扫描状态 | `BoardingSqliteLive`，当前处理路径不调用旧 Sheets 扫描函数。旧导出函数仍在 `googleDrive.js`，不等于当前扫描页在用。 |
| CBS 主案件、Wrong Baggage、WorldTracer、On-hand / Not Load / Missing Bags、损坏图片 | 默认 `cbsStorage.client()` 路由到 CBS SQLite；`CBS_STORAGE=sheets` 可以显式退回 Sheets，属于可恢复的依赖，而非默认生产路径。 |
| Baggage 收发／Test Baggage；Contact Form | 默认由 CBS SQLite 适配器接管指定的共享工作表页；修改相关 workbook/gid 或启用 `CBS_STORAGE=sheets` 会重新依赖 Sheets。 |
| Report Center Sales Details 查询、VIP、Authorization、INAD 等保存记录 | `reportSqlite.js`；Sales Details 的来源导入仍依赖上表所列 Sheets。旧 Report Sheets 函数仍留在文件中，不能按字符串出现次数统计。 |
| Schedule 页面、历史、审批、通知 | `staff_schedule_days` / 员工 SQLite；`staffScheduleLocal.js` 明确禁用 Sheets 同步。`staffScheduleSheets.js` / `staffScheduleSync.js` 是未接入常规页面的旧兼容模块。 |
| 旧 Google Sheets Briefing PDF 定时发送 | `createBriefingService()` 是 no-op；`createGoogleExporter()` 仍可导出 Sheets PDF，作为保留接口／手工工具列为潜在依赖，不能说仍有定时任务在发。 |
| 初始化／修复工具 | `scripts/import-cbs-sqlite.cjs`、Drive OAuth 授权工具及旧桌面 sync-queue 含 Google 调用；不是新的 Hotfix 下载源。 |

## 仍依赖 Google，但不是 Google Drive

- **Firebase Authentication**：员工登录、Google 登录、令牌验证；本次未移除，也没有把令牌搬到更新目录。
- **Gmail**：GD CHECK、NEXTDAY INFO、Meal Order、ETAB 收件及解析、Missing Bag 邮件导入、CBS／Bag Room／Misconnection 邮件、Briefing Arrival Express、Read & Sign、Uniform、轮椅等邮件发送。
- **Firebase Cloud Messaging**：移动设备推送；不同于 Drive 文件存储。

自选的 eTerm／历史文件夹目前可能位于 Google Drive for desktop 挂载目录。即便代码读取的是本地路径，若要完全断开 Drive 同步，仍需把这些源目录迁移到真正的本机／受控文件共享目录。此项审计没有移动、删除或上传用户原始文件。
