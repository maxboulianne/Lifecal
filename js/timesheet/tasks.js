// Tâches standard : un code permanent par activité, avec sa description standard
// (réutilisée sur la feuille de temps et la facture) et sa portée (pour s'y retrouver).
//
// Rangées dans doc.timesheet.tasks : [{ code, description, scope, quick }]
//   quick : affichée dans la sélection rapide de la saisie des heures
// Les codes ne changent jamais une fois adoptés ; on peut en ajouter (ex. TR01, EX01).

export const STANDARD_TASKS = [
  ["QA01", "Technical quality support", "Day-to-day quality questions, technical clarification and troubleshooting"],
  ["QA02", "Manufacturing Quality Plan review", "Review and revision of supplier or project MQPs, ITPs and inspection requirements"],
  ["QA03", "Technical specification review", "Review of customer specifications, codes, standards and contractual quality requirements"],
  ["QA04", "Painting specification review", "Review of coating systems, surface preparation, application and inspection requirements"],
  ["QA05", "Supplier technical coordination", "Technical discussions and follow-up with suppliers on quality requirements and deliverables"],
  ["QA06", "Project quality coordination", "Coordination with engineering, procurement and project management"],
  ["QA07", "Quality documentation review", "Review of inspection reports, certificates, test records and supporting documentation"],
  ["QA08", "Nonconformity assessment and disposition", "Assessment of defects, deviations and proposed repair or acceptance dispositions"],
  ["QA09", "Supplier corrective action follow-up", "Follow-up of supplier corrective actions, commitments and supporting evidence"],
  ["QA10", "Welding and fabrication requirements review", "Review of welding requirements, qualifications, procedures and fabrication controls"],
  ["QA11", "Inspection and testing requirements review", "Definition or review of VT, NDT, dimensional inspection and testing requirements"],
  ["QA12", "Supplier kick-off meeting preparation", "Preparation of quality requirements and inspection expectations for supplier KOMs"],
  ["QA13", "Supplier kick-off meeting", "Participation in supplier KOMs and clarification of quality obligations"],
  ["QA14", "Supplier inspection", "Inspection at supplier premises, including fabrication, coating and documentation checks"],
  ["QA15", "Coating defect investigation", "Investigation of blistering, adhesion loss, corrosion, holidays and other coating defects"],
  ["QA16", "Quality procedure and template development", "Preparation or improvement of procedures, checklists, forms and standard templates"],
  ["QA17", "Supplier audit preparation", "Review of supplier information and preparation of audit plans and checklists"],
  ["QA18", "Supplier audit", "Assessment of supplier quality systems, manufacturing processes and technical capabilities"],
  ["QA19", "Supplier audit reporting", "Preparation of audit reports, findings and recommendations"],
  ["QA20", "Audit corrective action verification", "Review and verification of actions taken to close audit findings"],
  ["QA21", "Supplier qualification and approval assessment", "Evaluation of new suppliers, new facilities or changes in supplier scope"],
  ["QA22", "Internal audit preparation", "Preparation of internal audit scope, criteria, plans and checklists"],
  ["QA23", "Internal audit", "Execution of internal quality system or process audits"],
  ["QA24", "Internal audit reporting", "Preparation of internal audit reports and improvement recommendations"],
  ["QA25", "Customer audit preparation and support", "Preparation for and participation in customer audits, including evidence coordination"],
  ["QA26", "Root cause analysis and corrective action support", "Structured investigation of recurring or significant problems and development of corrective actions"],
  ["QA27", "Trial fit-up and dimensional verification", "Review or witnessing of assembly fit-up, interfaces and dimensional conformity"],
  ["QA28", "Test witnessing and results review", "Witnessing of acceptance tests and review of results against specified criteria"],
  ["QA29", "Final inspection and release review", "Review of readiness for release to pack, shipment or customer acceptance"],
  ["QA30", "Manufacturing record book review", "Review of final quality dossiers, traceability records and document completeness"],
  ["QA31", "Customer technical clarification support", "Preparation of technical responses, clarification requests and quality justifications"],
  ["QA32", "Quality training and coaching", "Training or coaching of employees, inspectors and suppliers"],
  ["QA33", "Supplier performance and risk assessment", "Review of supplier performance, recurring issues, risks and improvement priorities"],
  ["QA34", "Quality management system improvement", "Improvement of QMS processes, responsibilities and interfaces"],
  ["QA35", "Quality metrics and management reporting", "Preparation of KPIs, dashboards, management summaries and quality status reports"],
  ["QA36", "Engineering process quality review", "Review of design controls, technical review practices and engineering deliverables"],
  ["QA37", "Procurement quality requirements development", "Preparation of supplier quality clauses, minimum QMS requirements and purchasing controls"],
  ["QA38", "Quality improvement project support", "Support for defined improvement initiatives involving multiple quality activities"],
];
// Sélection rapide par défaut : les tâches les plus fréquentes
const QUICK_DEFAULT = 16;

export const standardTasks = () => STANDARD_TASKS.map(([code, description, scope], i) => ({ code, description, scope, quick: i < QUICK_DEFAULT }));

const str = (v) => String(v ?? "").trim();
export const normalizeCode = (code) => str(code).toUpperCase().replace(/\s+/g, "");

// Absentes (anciennes données) : la liste standard ; sinon telles quelles, sans doublon de code.
export function normalizeTasks(raw) {
  if (raw === undefined) return standardTasks();
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).flatMap((t) => {
    const code = normalizeCode(t?.code);
    if (!code || seen.has(code) || !str(t.description)) return [];
    seen.add(code);
    return [{ code, description: str(t.description), scope: str(t.scope), quick: Boolean(t.quick) }];
  });
}

export const getTask = (ts, code) => ts.tasks.find((t) => t.code === normalizeCode(code)) ?? null;
export const quickTasks = (ts) => ts.tasks.filter((t) => t.quick);
export const otherTasks = (ts) => ts.tasks.filter((t) => !t.quick);

export function addTask(ts, { code, description, scope = "", quick = true }) {
  const task = { code: normalizeCode(code), description: str(description), scope: str(scope), quick: Boolean(quick) };
  if (!task.code || !task.description || getTask(ts, task.code)) return { ts, task: null };
  return { ts: { ...ts, tasks: [...ts.tasks, task] }, task };
}

export const updateTask = (ts, code, patch) => ({
  ...ts,
  tasks: ts.tasks.map((t) => (t.code === normalizeCode(code) ? { ...t, ...patch, code: t.code } : t)),
});
export const removeTask = (ts, code) => ({ ...ts, tasks: ts.tasks.filter((t) => t.code !== normalizeCode(code)) });
export const taskUseCount = (ts, code) => ts.entries.filter((e) => e.taskCode === normalizeCode(code)).length;
