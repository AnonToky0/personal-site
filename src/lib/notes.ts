import type { CollectionEntry } from 'astro:content';
export type Note = CollectionEntry<'notes'>;
const topics: Record<string, { title: string; description: string }> = {
  'computer-net': { title: '计算机网络', description: '从一次数据传输出发，理解网络如何工作，也学着把问题一步步查清。' },
  general: { title: '写作与工具', description: '记录写作方法、常用工具，以及维护这个小站的实践。' },
};
export function noteUrl(id: string) { return `/notes/${id.split('/').map(encodeURIComponent).join('/')}/`; }
export function topicId(note: Note) { return note.id.includes('/') ? note.id.split('/')[0] : 'general'; }
export function groupNotes(notes: Note[]) {
  const ids = [...new Set(notes.map(topicId))].sort((a, b) => a === b ? 0 : a === 'general' ? 1 : b === 'general' ? -1 : a.localeCompare(b));
  return ids.map(id => ({ id, ...(topics[id] ?? { title: id, description: '学习笔记与实践记录。' }),
    notes: notes.filter(note => topicId(note) === id).sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true })),
  }));
}
export function navTitle(note: Note) { return note.data.title.split(/[：:]/)[0]; }
