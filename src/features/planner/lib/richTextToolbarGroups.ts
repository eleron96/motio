import { Bold, Italic, List, ListOrdered, Quote, Strikethrough, Underline } from 'lucide-react';

// Formatting commands of the rich-text editors (task description, comments),
// grouped as the toolbars show them: text formatting | lists | blocks.
export const RICH_TEXT_TOOLBAR_GROUPS = [
  [
    { label: 'Bold', command: 'bold', icon: Bold },
    { label: 'Italic', command: 'italic', icon: Italic },
    { label: 'Underline', command: 'underline', icon: Underline },
    { label: 'Strike', command: 'strikeThrough', icon: Strikethrough },
  ],
  [
    { label: 'Bulleted list', command: 'insertUnorderedList', icon: List },
    { label: 'Numbered list', command: 'insertOrderedList', icon: ListOrdered },
  ],
  [
    { label: 'Quote', command: 'formatBlock', value: 'blockquote', icon: Quote },
  ],
] as Array<Array<{ label: string; command: string; value?: string; icon: typeof Bold }>>;
