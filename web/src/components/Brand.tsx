export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="#feed" aria-label="NimSocial home">
      <img className="brand__mark" src="/brand/nimsocial-mark.svg" alt="" width="44" height="44" />
      {!compact && (
        <span className="brand__type">
          <strong>NimSocial</strong>
          <small>Work in public</small>
        </span>
      )}
    </a>
  );
}
