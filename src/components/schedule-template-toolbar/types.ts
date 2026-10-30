import type { ScheduleTemplateRecord } from '@/components/schedule-template-modal';

export interface ScheduleTemplateToolbarProps {
  templates: ScheduleTemplateRecord[];
  disabled?: boolean;
  onApplyTemplate: (templateId: string) => void;
  onAddBlankEntry: () => void;
  onNewTemplate: () => void;
  onEditTemplate: (template: ScheduleTemplateRecord) => void;
}
