export default function ResourceRow({ resource, selected, error, onSelect, onToggle, onRecheck }) {
  // `error` is only populated by this session's own toggle/trigger/start-all calls, which
  // report "the enable/disable command was accepted" - not whether the resource actually came
  // up. `resource.lastError` is Tilt's own account of why it's currently in an error state (e.g.
  // a resource_deps dependency failing its check), so it's what explains things after a page
  // reload or when the failure happened in someone else's "Start All" click, not this click.
  const displayError = error || resource.lastError;
  return (
    <div
      className={`resource-row status-${resource.status}${selected ? ' selected' : ''}`}
      onClick={() => onSelect(resource.name)}
    >
      <div className="resource-row-top">
        <span className="status-dot" />
        <span className="resource-row-name">{resource.name}</span>
      </div>
      {resource.kind === 'process' ? (
        <button
          className={`toggle${resource.status !== 'disabled' ? ' on' : ''}`}
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
      {displayError && <div className="card-error">{displayError}</div>}
    </div>
  );
}
