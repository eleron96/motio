/**
 * Opening a task on the timeline (bell, push, project card, member panel) must
 * actually show it. The project board deliberately drops archived projects —
 * row, tasks and milestones — so a task of an archived project has nowhere to
 * appear there. Grouping by people always shows it, so that is where such a
 * deep link is sent.
 */

type RevealCandidateTask = {
  projectId: string | null;
  assigneeIds: string[];
} | null | undefined;

type RevealCandidateProject = {
  id: string;
  archived: boolean;
};

type RevealCandidateAssignee = {
  id: string;
  isActive: boolean;
};

export const needsAssigneeGroupingToRevealTask = ({
  task,
  projects,
  assignees,
  groupMode,
}: {
  task: RevealCandidateTask;
  projects: RevealCandidateProject[];
  assignees: RevealCandidateAssignee[];
  groupMode: 'assignee' | 'project';
}): boolean => {
  // Уже в группировке по людям — там видно всё, переключать нечего.
  if (groupMode !== 'project') return false;
  // Задача без проекта на доске проектов живёт в строке «Без проекта».
  if (!task?.projectId) return false;
  if (!projects.some((project) => project.id === task.projectId && project.archived)) return false;

  // Переключаем только если там задача действительно покажется: людская
  // группировка сама прячет задачи, у которых все исполнители отключены
  // (см. selectFilteredTasks). Иначе мы бы потеряли выбор пользователя впустую.
  if (task.assigneeIds.length === 0) return true;
  const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  return task.assigneeIds.some((id) => {
    const assignee = assigneeById.get(id);
    // Неизвестный локальному кэшу исполнитель задачу не прячет — то же правило.
    return assignee ? assignee.isActive : true;
  });
};
