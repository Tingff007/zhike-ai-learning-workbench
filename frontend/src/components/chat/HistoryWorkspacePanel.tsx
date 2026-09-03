import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
import { useConversationSessions } from '../../hooks/useConversationSessions';
import { useCourseContextStore } from '../../stores/course-context.store';
import type { HistorySession } from '../../stores/conversation.store';
import { useUiStore } from '../../stores/ui.store';
import { groupHistoryByTime } from '../../utils/history-time';

const panelEase = [0.16, 1, 0.3, 1] as const;

function HistoryItem({
  item,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  item: HistorySession;
  active: boolean;
  onSelect: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void | Promise<void>;
  onDelete: (sessionId: string) => void | Promise<void>;
}): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.title);

  async function commitRename(): Promise<void> {
    const nextTitle = draft.trim() || item.title;
    await onRename(item.id, nextTitle);
    setRenaming(false);
  }

  function beginRename(): void {
    setDraft(item.title);
    setRenaming(true);
  }

  if (renaming) {
    return (
      <div className="rounded-xl px-3 py-2">
        <input
          autoFocus
          value={draft}
          className="w-full border-0 bg-transparent px-0 py-1 text-[13px] font-medium text-slate-800 outline-none selection:bg-indigo-100"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commitRename();
            }
            if (event.key === 'Escape') {
              setRenaming(false);
              setDraft(item.title);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`group relative rounded-xl px-3 py-2.5 transition-all duration-150 hover:bg-white/90 hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] ${
        active ? 'bg-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.04)] ring-1 ring-indigo-100/80' : ''
      }`}
    >
      <button
        type="button"
        className="w-full truncate pr-14 text-left text-[13px] font-medium text-slate-800"
        onClick={() => onSelect(item.id)}
        onDoubleClick={(event) => {
          event.preventDefault();
          beginRename();
        }}
      >
        {item.title}
      </button>
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          title="重命名"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100/80"
          onClick={(event) => {
            event.stopPropagation();
            beginRename();
          }}
        >
          <Pencil className="h-3.5 w-3.5 text-slate-400 transition-colors hover:text-indigo-600" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title="删除"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-rose-50/80"
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(item.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-slate-400 transition-colors hover:text-rose-500" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function HistorySidePanel(): JSX.Element {
  const { currentCourseId, learningScope } = useCourseContextStore();
  const isHistoryPanelOpen = useUiStore((state) => state.isHistoryPanelOpen);
  const closeHistoryWorkspace = useUiStore((state) => state.closeHistoryWorkspace);
  const historyScopeId = learningScope === 'course' && currentCourseId ? currentCourseId : '';
  const { activeSessionId, courseHistory, fetchServerHistory, selectSession, renameSession, removeSession, startNewSession } =
    useConversationSessions(historyScopeId);
  const sections = groupHistoryByTime(courseHistory);
  const emptyCopy = historyScopeId ? '当前课程暂无历史会话' : '通用学习暂无历史会话';

  useEffect(() => {
    if (isHistoryPanelOpen) {
      void fetchServerHistory();
    }
  }, [fetchServerHistory, isHistoryPanelOpen]);

  return (
    <AnimatePresence initial={false}>
      {isHistoryPanelOpen && (
        <motion.aside
          key="history-side-panel"
          initial={{ x: -16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -16, opacity: 0 }}
          transition={{ duration: 0.3, ease: panelEase }}
          className="ai-history-side-panel"
          aria-label="会话历史"
        >
          <div className="ai-history-side-panel__head">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-700/80">History</span>
              <strong className="block text-sm font-semibold text-slate-900">会话历史</strong>
            </div>
            <button
              type="button"
              title="关闭"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
              onClick={() => closeHistoryWorkspace()}
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          <button
            type="button"
            className="mx-3 mb-2 inline-flex h-9 w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-xl border border-indigo-100 bg-white text-[13px] font-semibold text-indigo-700 shadow-[0_4px_12px_rgba(79,70,229,0.08)] transition hover:border-indigo-200 hover:bg-indigo-50/60"
            onClick={() => startNewSession()}
          >
            <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} />
            新对话
          </button>

          <div className="ai-history-side-panel__list">
            {sections.map((section) => (
              <section key={section.key}>
                <h3 className="mb-2 mt-3 pl-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {section.label}
                </h3>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      active={activeSessionId === item.id}
                      onSelect={selectSession}
                      onRename={renameSession}
                      onDelete={removeSession}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!courseHistory.length && (
              <p className="px-3 py-8 text-center text-xs text-slate-400">{emptyCopy}</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
