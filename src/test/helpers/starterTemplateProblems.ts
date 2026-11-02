import type { StarterTemplateContent } from '@/shared/domain/starterTemplate';

const duplicates = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);

/**
 * What would quietly go wrong in the database: a link to a key that does not
 * exist turns into an empty link there, a duplicate status name breaks a
 * unique index, overlapping time off of one person breaks a constraint.
 * Every template is checked against this, in every interface language.
 */
export const findStarterTemplateProblems = (content: StarterTemplateContent): string[] => {
  const problems: string[] = [];
  const keys = {
    status: new Set(content.statuses.map((item) => item.key)),
    type: new Set(content.taskTypes.map((item) => item.key)),
    tag: new Set(content.tags.map((item) => item.key)),
    project: new Set(content.projects.map((item) => item.key)),
    person: new Set(content.people.map((item) => item.key)),
  };

  if (content.statuses.length === 0) problems.push('no statuses');
  if (content.taskTypes.length === 0) problems.push('no task types');
  if (!content.statuses.some((status) => !status.isFinal && !status.isCancelled)) problems.push('no open status');
  if (!content.statuses.some((status) => status.isFinal)) problems.push('no final status');

  const lowerNames = (items: Array<{ name: string }>) => items.map((item) => item.name.trim().toLowerCase());
  duplicates(lowerNames(content.statuses)).forEach((name) => problems.push(`duplicate status ${name}`));
  duplicates(lowerNames(content.taskTypes)).forEach((name) => problems.push(`duplicate type ${name}`));
  duplicates(lowerNames(content.tags)).forEach((name) => problems.push(`duplicate tag ${name}`));
  duplicates(content.projects.map((item) => item.code)).forEach((code) => problems.push(`duplicate code ${code}`));

  content.tasks.forEach((task) => {
    if (task.project && !keys.project.has(task.project)) problems.push(`${task.title}: unknown project ${task.project}`);
    if (!keys.status.has(task.status)) problems.push(`${task.title}: unknown status ${task.status}`);
    if (!keys.type.has(task.type)) problems.push(`${task.title}: unknown type ${task.type}`);
    task.people.forEach((person) => {
      if (!keys.person.has(person)) problems.push(`${task.title}: unknown person ${person}`);
    });
    (task.tags ?? []).forEach((tag) => {
      if (!keys.tag.has(tag)) problems.push(`${task.title}: unknown tag ${tag}`);
    });
  });
  content.milestones.forEach((milestone) => {
    if (!keys.project.has(milestone.project)) problems.push(`${milestone.title}: unknown project ${milestone.project}`);
  });

  content.timeOff.forEach((record, index) => {
    if (!keys.person.has(record.person)) problems.push(`time off: unknown person ${record.person}`);
    content.timeOff.slice(index + 1).forEach((other) => {
      const overlap = other.person === record.person
        && other.start <= record.start + record.days - 1
        && record.start <= other.start + other.days - 1;
      if (overlap) problems.push(`time off of ${record.person} overlaps`);
    });
  });

  return problems;
};
