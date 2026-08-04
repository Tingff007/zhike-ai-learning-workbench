import { ListTree } from 'lucide-react';
import type { OutlineSection } from '../canvas/document-outline';

type ArtifactOutlineNavProps = {
  sections: OutlineSection[];
  activeSectionId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSectionSelect: (sectionId: string) => void;
};

export function ArtifactOutlineNav({
  sections,
  activeSectionId,
  collapsed,
  onToggleCollapse,
  onSectionSelect,
}: ArtifactOutlineNavProps): JSX.Element | null {
  if (!sections.length) return null;

  if (collapsed) {
    return (
      <button type="button" className="artifact-outline-nav artifact-outline-nav--collapsed" onClick={onToggleCollapse} title="展开目录">
        <ListTree size={16} />
        <span>目录</span>
      </button>
    );
  }

  return (
    <nav className="artifact-outline-nav" aria-label="文档目录">
      <div className="artifact-outline-nav__head">
        <span>目录</span>
        <button type="button" className="artifact-outline-nav__toggle" onClick={onToggleCollapse}>
          收起
        </button>
      </div>
      <ul>
        {sections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              className={`artifact-outline-nav__item artifact-outline-nav__item--level-${section.level} ${
                activeSectionId === section.id ? 'is-active' : ''
              }`}
              onClick={() => onSectionSelect(section.id)}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
