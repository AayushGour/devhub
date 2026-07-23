# Task board — <project>

Owner: architect creates/assigns. Each agent updates its own task's status.

Format:
`- [ ] T<id> [owner] <title>  prio:<P0|P1|P2|P3>  status:<todo|wip|review|test|done|blocked>  deps:<ids|->`
owners: architect | product-engineer | ux-designer | senior-dev | junior-dev | devops | reviewer | tester
prio (PM sets): P0 critical · P1 high · P2 medium · P3 low

## Plan mode  (done before dev mode)
- [x] T0 [business-analyst] Requirements → project-context.md  prio:P1  status:done
- [ ] T1 [architect] Design + standards + task split  prio:P1  status:wip
- [ ] T1a [ux-designer] Flows + design system + a11y AC → design.md  prio:P2  status:todo  deps:T1
- [ ] T1b [product-engineer] Feasibility + spike unknowns  prio:P2  status:todo  deps:T1

## Dev mode
- [ ] T2 [senior-dev] <hard task>  prio:P1  status:todo  deps:T1
- [ ] T3 [junior-dev] <easy task>  prio:P2  status:todo  deps:T1
- [ ] T4 [devops] <deploy/CI task>  prio:P2  status:todo  deps:T2
- [ ] T5 [reviewer] Review T2+T3 code + integration  prio:P1  status:todo  deps:T2,T3
- [ ] T6 [tester] Validate T2+T3 vs AC  prio:P1  status:todo  deps:T5
