import React, { useEffect, useState } from 'react';
//
export function CustomEmoji({ src, alt = 'Custom emoji', className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <span className={`arc-custom-emoji ${className}${failed ? ' is-unavailable' : ''}`} role="img" aria-label={alt} title={alt}>
      {!failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
      {failed && <span aria-hidden="true">☺</span>}
    </span>
  );
}
