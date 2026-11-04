# Group + individual assignment in service-desk, shared-inbox, ITSM and field-service products (2025-2026)

Research method note: about 16 search/fetch calls. Official help-centre pages were fetched for Zendesk omnichannel routing, Freshdesk automatic assignment and Front round robin vs load balancing. Everything else comes from search-result summaries of official pages (HubSpot, Odoo, ServiceTitan, Jobber, Zendesk Play/Guided mode, Salesforce developer docs) or from community and third-party pages. Those are flagged where they appear. I could not retrieve Help Scout's official docs, Housecall Pro's docs or an ITIL 4 practice-guide text.

## 1. How the group/queue vs individual assignee is modelled, and what members see

### Takeaway
Nearly every product uses two fields on the work item: a group or queue that owns it collectively, and an optional individual assignee. "Unassigned" means the group is set and the person is blank. Members usually see three slices: items assigned to me, unassigned items in my groups, and everything they are allowed to see. Visibility is usually scoped by group membership.

### Cited Findings
- **Zendesk.** Without custom queues, a ticket "must be assigned to a group to be eligible for routing". Routing then selects an individual agent within the group. Custom queues (Professional and above) can route to several groups, trying primary groups first and fallback groups second. — [Zendesk: About omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status)
- **Zendesk views.** A single view using the condition "group is current user's groups" plus assignee unassigned shows each agent the unassigned New/Open tickets in their own groups, so one view serves every group. Users report that mixing this with "assigned to me" in the same view is awkward and recommend two separate views ("my tickets" and "unassigned in my groups"). — [Zendesk community thread](https://support.zendesk.com/hc/en-us/community/posts/4409515287450-Assign-ticket-to-a-group-of-agents/comments/4409509901594)
- **Zendesk Agent Home.** A 2024 feature request asks to bring back "unassigned tickets in your groups" on Agent Home, because agents have to leave Home to find new work. This shows how central that list is to the workflow. — [Zendesk community post](https://support.zendesk.com/hc/en-us/community/posts/6745361237146-Add-List-of-Unassigned-Tickets-in-Your-Groups-to-Agent-Home/comments/8882118109082)
- **Salesforce.** A queue can own records (cases, leads and others). Queue members, and users above them in the role hierarchy, can see the queue list view and take ownership. Access to the list view follows sharing settings. Third-party and university guides, not official Salesforce help. — [UMN Enterprise CRM: Manage Cases from Queues](https://it.umn.edu/services-technologies/how-tos/enterprise-crm-service-console-manage-0); [SalesforceBen: Salesforce Queues](https://www.salesforceben.com/everything-you-need-to-know-about-salesforce-queues/)
- **Salesforce ownership model.** The owner field holds either a user or a queue. "Change Owner" moves records to another user or queue, with an optional email to the new owner. Secondary source. — [UMN guide](https://it.umn.edu/services-technologies/how-tos/enterprise-crm-service-console-manage-0)
- **ServiceNow.** Incidents carry an assignment group plus an "assigned to" user. A built-in "Reassignment count" field counts reassignments, and the out-of-box Assignment Group metric logs every change of the group field. Mostly community sources plus the official metric-definition docs. — [ServiceNow community: reassignment count](https://www.servicenow.com/community/developer-forum/reassignment-count-for-a-assignment-group/m-p/2843719); [ServiceNow docs: metric definition support](https://www.servicenow.com/docs/r/platform-administration/c_MetricDefinitionSupport.html)
- **Front.** In the legacy layout, a teammates list shows each teammate's assignments that came from shared inboxes. Companies created after 26 Jan 2023 use "Views" instead. — [Front help: teammates list (legacy)](https://help.front.com/en/articles/2124)
- **Odoo Helpdesk.** Work is organised by team. Team visibility can be invited internal users only (private), all internal users, or invited portal users plus all internal users. If the team-member field is left empty, everyone with the right access rights is included. — [Odoo 18 Helpdesk docs](https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html)
- **HubSpot.** Tickets are assigned to specific users or teams through the "Rotate record to owner" workflow action. Only *main* team members holding a Sales or Service Hub Professional/Enterprise seat are eligible. Secondary team members are not. — [HubSpot KB: Assign tickets using workflows](https://knowledge.hubspot.com/workflows/assign-tickets-using-workflows)

### Inferences
- The pattern is consistent across products: an owning group or queue, a nullable individual assignee, and group membership deciding what you can see and claim. For a small business, "Production queue + optional assignee" lines up directly with Zendesk's group/assignee and ServiceNow's assignment group/assigned to.
- The standard member home screen has three lists: *Mine*, *Unassigned in my teams* and *All in my teams*. Zendesk's community experience suggests keeping these as separate lists rather than one combined list.
- Salesforce's model, where the owner is a user or a queue, makes "group and person" mutually exclusive. The Zendesk/ServiceNow model keeps the group when a person is assigned. The second fits better when work stays accountable to a team after someone claims it.

### Gaps
- I could not fetch Help Scout's official docs on the Mine / Unassigned / Assigned folders. Its URL returned 404.
- No official Salesforce Help page was retrieved for queue list views. The claims rely on secondary guides.

## 2. Claim / take / accept mechanics and collision prevention

### Takeaway
Claiming usually means setting the assignee to yourself: Salesforce's "Accept", a "take it" or assign-to-me control, or dragging an item onto a person on a dispatch board. Collision prevention ranges from soft signals (who is viewing, skipping items someone else has open) to hard push-accept handshakes with timeouts (Salesforce Omni-Channel, Zendesk messaging).

### Cited Findings
- **Salesforce Accept.** On a queue list view, a member can select one or more records and click Accept to become owner of all of them. From a single case record, Accept sets you as owner in one step. The button appears on queue list views, not on every list view. Secondary source. — [UMN guide](https://it.umn.edu/services-technologies/how-tos/enterprise-crm-service-console-manage-0)
- **Salesforce Omni-Channel push timeout.** Queue routing configs have a `pushTimeout`, the seconds an agent has to respond before the item is pushed to another agent. A value of 0 means it is disabled. AgentWork records a `DeclinedOnPushTimeout` status and a `PushTimeoutDateTime`. — [Salesforce Metadata API: QueueRoutingConfig (v64)](https://developer.salesforce.com/docs/atlas.en-us.264.0.api_meta.meta/api_meta/meta_queueroutingconfig.htm); [Salesforce: AgentWork object](https://developer.salesforce.com/docs/atlas.en-us.252.0.object_reference.meta/object_reference/sforce_api_objects_agentwork.htm)
- **Salesforce routing priority.** Work from routing configurations with lower `routingPriority` values (for example 0) is routed first. — [QueueRoutingConfig](https://developer.salesforce.com/docs/atlas.en-us.264.0.api_meta.meta/api_meta/meta_queueroutingconfig.htm)
- **Salesforce conflicting report.** A Trailblazer community poster says an item that timed out stayed owned by the agent instead of returning to the queue. Help text cited in the same thread says it returns to the original queue. Unresolved and anecdotal. — [Trailblazer community](https://trailhead.salesforce.com/trailblazer-community/feed/0D5KX00000jAHUx0AO)
- **Zendesk messaging and calls.** Messaging and chat can be reassigned if not accepted within a threshold (30 s by default, customisable on Enterprise) when reassignment timing is on. Declined or unanswered calls return to the queue and are offered round robin until the maximum queue wait expires. — [Zendesk omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status)
- **Zendesk Play mode collision avoidance.** The next ticket served is the next one in the view's sort order that you have not skipped "and that no other agent is currently viewing". — [Zendesk: Using Play mode](https://support.zendesk.com/hc/en-us/articles/9186492658714-Using-Play-mode-to-quickly-work-through-tickets)
- **Zendesk capacity override.** Capacity limits restrict how much work is routed to an agent, but "agents can assign themselves work in excess of these limits if they want to". — [Zendesk omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status)
- **Collision detection, defined by third parties.** Help desks such as Chatwoot show who owns or is replying to a conversation, to prevent duplicate replies. Vendor marketing. — [Chatwoot collision detection](https://www.chatwoot.com/features/collision-detection); [Macha glossary: agent collision](https://www.getmacha.com/glossary/agent-collision)
- **Field service.** In ServiceTitan, removing a technician from a job moves it back to the Unassigned tab of the Jobs Tray, ready to be reassigned. — [ServiceTitan: dispatch and track your technicians](https://help.servicetitan.com/docs/dispatch-and-track-your-technicians). In Jobber, an unassigned visit shows a red "Unassigned" icon in the team section, and you assign it with Edit → Assign. — [Jobber help: visits](https://help.getjobber.com/es/articles/visits/)

### Inferences
- For a small team without a real-time presence system, a server-side conditional claim (set the assignee only if it is still null, and report "already taken by X" otherwise) does the work of Salesforce's Accept. A "currently viewing" indicator is a nice extra, not a requirement. This also fits an offline-first client: an offline claim is a pending intent until the server confirms it.
- Push-with-accept timeouts are designed for real-time channels (chat, calls). They are unnecessary for production jobs that last hours or days.

### Gaps
- I did not retrieve official text for Zendesk's "take it" link on the assignee field, Front's collision detection, or Help Scout's "traffic cop" collision feature, although these are widely known.

## 3. Auto-assignment options and when vendors recommend push vs pull

### Takeaway
The common options are round robin (even rotation), load balanced (fewest open items, up to a cap), skills-based, and capacity plus availability gating (online, away, out-of-office, time off). Vendors recommend round robin for small teams with simple work and a reliably available rota, and load balancing when availability fluctuates or nothing may go unassigned. Most advanced routing is limited to higher plans.

### Cited Findings
- **Freshdesk Omniroute.** Round robin assigns to online agents in circular order based on capacity, and is "suited to small teams or simpler transactional queries". Load-based assigns by how many more tickets each agent can handle, for larger, higher-volume teams. Skill-based routes only to available agents with matching skills and capacity. Admins set capacity, who can set availability, and whether assignment prefers ticket age or SLA priority. An agent at maximum capacity gets nothing new until they resolve a ticket, and only agents in the Available (online) status are considered. Advanced automatic routing is on Pro and Enterprise. — [Freshdesk: automatic ticket assignment](https://support.freshdesk.com/support/solutions/articles/196581-automatic-ticket-assignment-in-a-round-robin-manner)
- **Freshdesk unassigned tickets.** A group automation rule can notify the group while the ticket stays unassigned. Troubleshooting covers the load-balanced cutoff being reached. — [Freshdesk](https://support.freshdesk.com/support/solutions/articles/196581-automatic-ticket-assignment-in-a-round-robin-manner)
- **Zendesk omnichannel routing.** It picks an agent by eligible status, spare capacity and skills. Ties are broken by highest spare capacity or by round robin. Skills can carry an optional timeout, after which a ticket can go to agents without the skill. Email requires the agent to be online or away; messaging and calls require online. Idle or disconnected agents are set offline automatically. Plan limits: Team routes oldest first; Growth adds SLA-based routing; Professional adds priority and skills routing and custom queues; Enterprise adds customisable reassignment timing. — [Zendesk omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status)
- **Front.** Round robin rotates among online teammates. "If all teammates are offline, the system won't assign the conversation", and there is no queue holding it for later. Load balancing holds conversations in a queue until someone is available, then assigns oldest unreplied first, subject to a per-teammate limit. Front recommends round robin when work should be spread evenly and someone is reliably online, and load balancing when availability fluctuates or no conversation can go unassigned. — [Front: round robin vs load balancing](https://help.front.com/en/articles/1315904). Third-party claim: the load-balancing cap is at most 100 per teammate and does not apply to plain round robin. — [Macha: round robin in Front](https://www.getmacha.com/blog/how-to-set-up-round-robin-in-front). Community claim: out-of-office teammates are skipped. — [Front community](https://community.front.com/product-q-a-45/load-balance-w-round-robin-feature-2209)
- **HubSpot.** "Rotate record to owner" offers load balanced, round robin or random distribution. Users set to Away are not assigned, and if everyone is away the record stays unassigned. Users over their ticket capacity limit (Service Hub Enterprise only) become ineligible. Requires Service Hub Professional or Enterprise. — [HubSpot KB](https://knowledge.hubspot.com/workflows/assign-tickets-using-workflows). Community claim: plain round robin is strict rotation and ignores tickets assigned manually or by other actions. — [HubSpot community](https://community.hubspot.com/t/automate-ticket-assignment-rotation/24611)
- **Odoo Helpdesk.** Automatic assignment is a per-team checkbox with two methods: one spreads tickets by total count (open or closed, ignoring current load), the other balances on currently open tickets. Members on time off are skipped, and the system looks ahead in the calendar for the next available person. — [Odoo 18 Helpdesk docs](https://www.odoo.com/documentation/18.0/applications/services/helpdesk.html)
- **Intercom (comparison point).** Round robin assigns to active teammates in sequence and ignores assignment limits. Intercom recommends balanced assignment for support teams. — [Intercom: round robin](https://www.intercom.com/help/en/articles/6512504-assign-conversations-evenly-using-round-robin)
- **Hiver (comparison point).** Admins choose who is in the auto-assignment pool. Custom rules are evaluated before round robin. — [Hiver: round robin](https://help.hiverhq.com/productivity/round-robin-assignment)
- **Zendesk's own definitions.** Push means the system assigns tickets to agents; pull means agents assign work to themselves. — summarised in [eesel: Zendesk routing guide (third party)](https://eesel.ai/blog/zendesk-routing)

### Inferences
- With four teams of a few people each, rule-based routing to a team (by order type or stage) with optional round robin or load-balancing inside the team is enough. Skills and capacity engines are enterprise-tier features and probably excessive here.
- Availability gating (out-of-office or time off means skip) matters even for small teams. HubSpot, Front and Odoo all skip absent people. A design choice remains: leave the item unassigned in the team queue (HubSpot, Front round robin) or hold it until someone is available (Front load balancing, Odoo look-ahead).

### Gaps
- No vendor document gave a quantitative threshold (team size or volume) for switching from pull to push.

## 4. Problems with pull queues and how products mitigate them

### Takeaway
The documented problem is cherry-picking: easy or quick items get taken and complex ones go stale, often driven by metrics that count completions. Mitigations include serving the next item in a fixed sort order instead of a free list (Zendesk Play and Guided mode), sorting and routing oldest first or by SLA breach, auto-unassigning stale claims, and switching to push for items waiting too long.

### Cited Findings
- **Gladly.** Cherry-picking is defined as deviating from the normal routing order to select a different ticket. Causes: completion-based metrics and poor training ("the urge to cherry-pick tickets is often a symptom of inadequate training"). Effects: complex requests stay unresolved for days or weeks, colleagues inherit the harder cases, and metrics are skewed. Mitigations: skills-based routing and outcome metrics. Vendor blog. — [Gladly: cherry-picking tickets](https://www.gladly.ai/blog/cherry-picking-tickets-customer-service/)
- **Supportbench.** Recommends FIFO "push-next" to the least-loaded agent so older tickets are handled regardless of complexity, KPIs that reward complex work, and real-time monitoring. Vendor blog. — [Supportbench: preventing agent cherry-picking](https://www.supportbench.com/?p=24861)
- **Zendesk Play mode.** Serves the next ticket in the view's sort order. — [Zendesk: Play mode](https://support.zendesk.com/hc/en-us/articles/9186492658714-Using-Play-mode-to-quickly-work-through-tickets)
- **Zendesk Guided mode.** Enterprise and Enterprise Plus only. Agents are restricted to the Play button and "won't be able to see a list of the tickets in the view". Skipping prompts for a reason, but the reason is optional. Agents can still open tickets through search and user or organisation profiles. — [Zendesk: Setting up Guided mode](https://support.zendesk.com/hc/en-us/articles/4408825479066-Setting-up-Guided-mode). Third-party claim, not verified with Zendesk: Explore cannot report on skips in Guided mode. — [eesel: Zendesk skip queue](https://www.eesel.ai/blog/zendesk-skip-queue)
- **Routing oldest first.** Zendesk Team plans route the oldest eligible ticket first; higher plans can route by soonest SLA breach or by priority then age. — [Zendesk omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status). Freshdesk lets admins prefer ticket age or SLA priority. — [Freshdesk](https://support.freshdesk.com/support/solutions/articles/196581-automatic-ticket-assignment-in-a-round-robin-manner). Front load balancing assigns oldest unreplied first. — [Front](https://help.front.com/en/articles/1315904)
- **Returning stale claims.** A Zendesk-style automation clears the assignee when assignee is set, status is Open, and "hours since assigned" is greater than X, sending the ticket back to the group queue. Third-party help page. — [Playlist help: send tickets back to their queue](https://help.myplaylist.io/hc/en-us/articles/360035454992-Automatically-send-tickets-back-to-their-queue-so-that-they-can-be-reassigned-to-another-agent)
- **Hybrid pull then push.** A USPTO patent describes pull by default with a switch to push for tickets pending too long. — [USPTO patent 9548883](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9548883)
- **Sales leads.** In pull distribution, reps grab the obviously good leads first. — [Rework: pull distribution methods](https://resources.rework.com/libraries/lead-management/pull-distribution-methods)

### Inferences
- Practical mitigations for a small business: sort the team queue oldest first (or by due date) by default; show age badges; offer a "take next" button alongside the list; flag or escalate items left unclaimed past a threshold; and record "skip" or release reasons. Hiding the list completely (Guided mode) is an enterprise-scale control and probably too heavy for teams of two to five.
- Auto-unassigning stale claims needs care in a fabrication context. A claimed production job may legitimately sit for days, so stale-claim rules should key on inactivity or due dates, not raw hours since assignment.

### Gaps
- I found no independent (non-vendor) empirical study quantifying cherry-picking or the effect of mitigations. The evidence is vendor and practitioner opinion.

## 5. SLA and aging metrics for unassigned work, and escalation rules

### Takeaway
Products track how long items wait unassigned (time to first assignment), how often they bounce (reassignment count, group-hop sequence), and SLA breach timers. Escalation is usually an automation or timer: notify the group or a lead, widen to fallback groups, relax skill requirements, or unassign and re-route.

### Cited Findings
- **ServiceNow.** The "Reassignment count" field counts every reassignment. The Assignment Group metric logs each group change, and measuring how long an item sat with a group requires collecting assignment changes and computing durations. The Premium incident dashboard tracks the percentage of incidents resolved without reassignment. Community advice: count reassignment as a change of assignment_group, not of the user; report on metric instances rather than sys_audit. Known pitfalls: double counting when the group is set twice, and incident tasks not incrementing the count. — [ServiceNow docs: metric definition](https://www.servicenow.com/docs/r/platform-administration/c_MetricDefinitionSupport.html); [ServiceNow docs: Incident Premium dashboard (legacy)](https://www.servicenow.com/docs/r/Mr7qUatbFXax1_h~z60rmA/I5PEqcazshS1rrYNOUcQcQ); [Community: measuring reassignments](https://www.servicenow.com/community/platform-analytics-articles/measuring-incident-reassignments-to-the-service-desk-or-any/ta-p/2302954); [Community: reassignment count incorrect](https://www.servicenow.com/community/incident-management-forum/incident-reassignment-count-is-incorrect/m-p/3005221)
- **Zendesk escalation of unclaimed work.**
  - Skills timeout: work falls through to unskilled agents after a wait.
  - Custom queues (Professional and above): primary then fallback groups.
  - SLA-breach routing order (Growth and above).
  — [Zendesk omnichannel routing](https://support.zendesk.com/hc/en-us/articles/4409149119514-About-omnichannel-routing-with-unified-agent-status)
- **Third-party guide to escalating unassigned Zendesk tickets.** Automations on "hours since created" plus "assignee is -" notify a lead or reassign. — [eesel: escalate unassigned tickets](https://www.eesel.ai/blog/zendesk-automation-escalate-unassigned-tickets)
- **ServiceTitan.** Treats end-of-day unassigned jobs as a coverage metric ("zero unassigned jobs means full coverage"). A custom report or export lists unassigned jobs. — [ServiceTitan: dispatch and track your technicians](https://help.servicetitan.com/docs/dispatch-and-track-your-technicians); [ServiceTitan: export report of unassigned jobs](https://help.servicetitan.com/docs/exporting-report-of-unassigned-jobs)
- **Salesforce Omni-Channel.** Records push timeouts per AgentWork (`DeclinedOnPushTimeout`, `PushTimeoutDateTime`), which can be reported as a declined/timeout rate. — [Salesforce AgentWork](https://developer.salesforce.com/docs/atlas.en-us.252.0.object_reference.meta/object_reference/sforce_api_objects_agentwork.htm)

### Inferences
- Useful minimal metrics for team queues:
  - unclaimed age (now minus when the item entered the team queue)
  - time to first claim
  - reassignment and handoff count, counted on team change separately from person change
  - unclaimed-at-end-of-day count per team

  All of these need an append-only assignment-history log (team, assignee, actor, timestamp). ServiceNow's experience shows that reconstructing them from a generic audit table is fragile.

### Gaps
- No ITIL 4 practice-guide text was retrieved. ITIL's functional versus hierarchical escalation concepts are not sourced here.
- I found no vendor-published benchmark targets for time to first assignment.

## 6. Dispatch-board conventions in field service for unassigned jobs and crews

### Takeaway
Field-service products put unassigned or unscheduled work in a side tray or sidebar next to a calendar or timeline with a lane per technician. Dispatchers drag items onto a person and time slot. Removing a technician sends the job back to the tray. Map views support bulk reassignment, for example when someone calls in sick. "Zero unassigned at end of day" is a stated operating target.

### Cited Findings
- **ServiceTitan.**
  - Unassigned jobs appear in the Unassigned tab of the Jobs Tray on the Dispatch Board. Removing a technician returns the job there. — [ServiceTitan: dispatch and track](https://help.servicetitan.com/docs/dispatch-and-track-your-technicians); [ServiceTitan: Job tray on the new daily and weekly dispatch board](https://help.servicetitan.com/commercial/docs/use-the-job-tray-on-the-new-daily-and-weekly-dispatch-board)
  - Booked jobs can be left unassigned for the dispatcher to route. — [ServiceTitan release hub](https://help.servicetitan.com/release-hub/docs/leave-booked-jobs-unassigned-for-dispatcher-routing-in-the-field-mobile-app)
  - Dispatch Pro (an AI add-on, plan or add-on gated) can move jobs between assigned and unassigned, with an alert explaining each unassignment. — [ServiceTitan: Dispatch Pro on the dispatch board](https://help.servicetitan.com/how-to/view-dispatch-pro-on-the-dispatch-board)
  - Reserve with Google bookings create unassigned jobs. — [ServiceTitan](https://help.servicetitan.com/v1/docs/how-does-reserve-with-google-create-unassigned-jobs)
- **Jobber.**
  - Unscheduled visits sit in an "unscheduled" sidebar and are dragged onto the schedule. — [Jobber: schedule overview (new schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
  - Unassigned visits show a red Unassigned icon. — [Jobber: visits](https://help.getjobber.com/es/articles/visits/)
  - The legacy map view supports bulk-assigning many visits to one user, for example when someone calls in sick. — [Jobber: assigning multiple visits at once (legacy)](https://help.getjobber.com/en/articles/assigning-multiple-visits-at-once-to-users-legacy-schedule/); [Jobber: map view (legacy)](https://help.getjobber.com/en/articles/map-view-legacy-schedule/)
  - The new schedule has a "Reschedule and Reassign" tool. — [Jobber: schedule overview](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
  - The mobile app shows unscheduled visits, assessments and tasks on a map, so users with scheduling permission can reassign to someone closer. — [Jobber product update](https://productupdates.getjobber.com/24440-view-and-manage-unscheduled-work-on-the-go)

### Inferences
- In field service, unassigned and unscheduled are separate states. A job can have a crew but no slot, or a slot but no crew. A signage business's Production queue likely needs both "unclaimed" and "unscheduled" indicators.
- These products are dispatcher-driven (push by a coordinator), not self-claim. A small fabrication shop may mix the two: a production lead pushes jobs onto people or crews while staff can also take items from the team tray.

### Gaps
- No Housecall Pro documentation on unassigned jobs or the dispatch board was retrieved.
- Odoo Field Service's handling of unassigned tasks and its Gantt/map dispatch was not retrieved.
- Crew or team-level assignment in ServiceTitan/Jobber (assigning to a crew rather than a person) was not confirmed in the sources fetched.
