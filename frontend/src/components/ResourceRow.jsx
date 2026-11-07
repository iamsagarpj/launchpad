import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ResourceRow({ resource, selected, error, registered, menuOpen, onMenuToggle, onSelect, onToggle, onRecheck, onEdit, onRemove }) {
  const menuButtonRef = useRef(null);
  // `error` is only populated by this session's own toggle/trigger/start-all calls, which
  // report "the enable/disable command was accepted" - not whether the resource actually came
  // up. `resource.lastError` is Tilt's own account of why it's currently in an error state (e.g.
  // a resource_deps dependency failing its check), so it's what explains things after a page
  // reload or when the failure happened in someone else's "Start All" click, not this click.
  const displayError = error || resource.lastError;
  const hasMenu = Boolean(onRemove || (registered && onEdit));

  return (
    <div
      className={`resource-row status-${resource.status}${selected ? ' selected' : ''}`}
      onClick={() => onSelect(resource.name)}
    >
      <div className="resource-row-main">
        <div className="resource-row-top">
          <span className="status-dot" />
          <span className="resource-row-name" title={registered ? registered.path : resource.name}>
            {resource.name}
          </span>
          {registered && (
            <span className="resource-row-path" title={registered.path}>
              {registered.path}
            </span>
          )}
        </div>
        {resource.kind === 'process' ? (
          <button
            className={`toggle${resource.status !== 'disabled' ? ' on' : ''}`}
            aria-label={resource.status !== 'disabled' ? `Stop ${resource.name}` : `Start ${resource.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(resource.name);
            }}
          />
        ) : (
          <button
            className="recheck-btn"
            onClick={(event) => {
              event.stopPropagation();
              onRecheck(resource.name);
            }}
          >
            Re-check
          </button>
        )}
        {hasMenu && (
          <button
            ref={menuButtonRef}
            type="button"
            className={`row-menu-btn${menuOpen ? ' open' : ''}`}
            aria-label={`${resource.name} actions`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onMenuToggle();
            }}
          >
            <span aria-hidden="true">⋮</span>
          </button>
        )}
      </div>
      {menuOpen && hasMenu && (
        <RowMenu
          anchorRef={menuButtonRef}
          onClose={onMenuToggle}
          path={registered ? registered.path : ''}
          onEdit={registered && onEdit ? () => onEdit(registered) : null}
          onRemove={onRemove ? () => onRemove(resource, registered) : null}
        />
      )}
      {displayError && <div className="card-error">{displayError}</div>}
    </div>
  );
}

function RowMenu({ anchorRef, onClose, path, onEdit, onRemove }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!rect || !menu) return;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const below = rect.bottom + 6;
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
      setPosition({ top, left });
    }
    place();
    function onPointerDown(event) {
      if (anchorRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      onClose();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="row-menu"
      role="menu"
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      onClick={(event) => event.stopPropagation()}
    >
      {path && <div className="row-menu-path">{path}</div>}
      {onEdit && (
        <button type="button" role="menuitem" onClick={onEdit}>
          Edit
        </button>
      )}
      {onRemove && (
        <button type="button" role="menuitem" className="danger" onClick={onRemove}>
          Remove
        </button>
      )}
    </div>,
    document.querySelector('.app-shell') || document.body
  );
}
