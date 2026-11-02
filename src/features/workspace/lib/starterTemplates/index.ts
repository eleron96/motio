import { t } from '@lingui/macro';
import {
  buildStarterTemplatePayload,
  type StarterTemplateContent,
  type StarterTemplateId,
  type StarterTemplatePayload,
} from '@/shared/domain/starterTemplate';
import { meetingType, statusesWith } from '@/features/workspace/lib/starterTemplates/common';
import { buildDesignTemplate } from '@/features/workspace/lib/starterTemplates/designTemplate';
import { buildBimTemplate } from '@/features/workspace/lib/starterTemplates/bimTemplate';
import { buildConstructionTemplate } from '@/features/workspace/lib/starterTemplates/constructionTemplate';
import { buildSoftwareTemplate } from '@/features/workspace/lib/starterTemplates/softwareTemplate';

export type StarterTemplateDefinition = {
  id: StarterTemplateId;
  /** The industry, so people recognise themselves. */
  title: () => string;
  /** How such a team plans: what the examples will look like. */
  summary: () => string;
  /** Built at the moment of applying, in the interface language. */
  build: () => StarterTemplateContent;
};

const buildEmptyTemplate = (): StarterTemplateContent => ({
  statuses: statusesWith(null),
  taskTypes: [{ key: 'task', name: t`Task` }, meetingType()],
  tags: [],
  projects: [],
  people: [],
  tasks: [],
  milestones: [],
  timeOff: [],
});

/**
 * What a new workspace can start from. Cut by how a team plans, not by
 * country: no stages, permits or standards by name. Order is the order of the
 * cards; the empty one is always last.
 */
export const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    id: 'design',
    title: () => t`Architecture and design`,
    summary: () => t`Architects, engineers, interior designers: several buildings at once, handovers to the client.`,
    build: buildDesignTemplate,
  },
  {
    id: 'bim',
    title: () => t`BIM and project support`,
    summary: () => t`BIM teams, technical support, quality control: requests from many projects and regular checks.`,
    build: buildBimTemplate,
  },
  {
    id: 'construction',
    title: () => t`Construction and installation`,
    summary: () => t`Crews on sites and field work: who is where this week.`,
    build: buildConstructionTemplate,
  },
  {
    id: 'software',
    title: () => t`Software development`,
    summary: () => t`Product teams and studios: features, bugs and releases.`,
    build: buildSoftwareTemplate,
  },
  {
    id: 'empty',
    title: () => t`Empty workspace`,
    summary: () => t`No examples, just basic statuses to start from.`,
    build: buildEmptyTemplate,
  },
];

export const findStarterTemplate = (id: StarterTemplateId) => (
  STARTER_TEMPLATES.find((template) => template.id === id) ?? null
);

/**
 * The payload for `apply_workspace_template`, built now — so in the interface
 * language of this moment — with the examples around `today`.
 */
export const buildStarterTemplatePayloadFor = (
  id: StarterTemplateId,
  today: Date,
): StarterTemplatePayload | null => {
  const template = findStarterTemplate(id);
  return template ? buildStarterTemplatePayload(template.build(), today) : null;
};
