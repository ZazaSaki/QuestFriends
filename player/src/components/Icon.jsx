/**
 * Material Symbols Outlined glyph. `fill` opts into the filled cut, matching the
 * `font-variation-settings: 'FILL' 1` that the Stitch markup sets inline.
 */
export default function Icon({ name, fill = false, className = '', style, ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined${fill ? ' fill' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    >
      {name}
    </span>
  );
}
