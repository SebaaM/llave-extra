import { useId } from 'react'
import type { ShopExample } from './examples'

/** Ilustraciones vectoriales originales; no son fotografías de productos reales. */
export function ProductArt({ product }: { product: ShopExample }) {
  const id = useId().replace(/:/g, '')
  const paint = `url(#${id}-paint)`
  return <svg viewBox="0 0 360 280" role="img" aria-label={`Ilustración de ejemplo: ${product.name}`}>
    <defs>
      <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="1" y2=".7"><stop stopColor={product.color} /><stop offset="1" stopColor={product.color} stopOpacity=".65" /></linearGradient>
      <pattern id={`${id}-layers`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 4.5h5" stroke="#fff" strokeOpacity=".17" strokeWidth=".6" /></pattern>
    </defs>
    <ellipse cx="180" cy="237" rx="84" ry="12" fill="#173d40" opacity=".09" />
    {product.shape === 'penguin' && <g>
      <path d="M125 129Q94 161 106 193L131 178M235 129Q266 161 254 193L229 178" fill={product.color} />
      <path d="M137 221l-11 16h42l8-15m9 0 8 15h42l-14-16" fill="#d38a4b" />
      <path d="M180 44C135 44 123 90 123 137c-12 56-4 90 57 90s69-34 57-90c0-47-12-93-57-93" fill={paint} />
      <path d="M180 44C135 44 123 90 123 137c-12 56-4 90 57 90s69-34 57-90c0-47-12-93-57-93" fill={`url(#${id}-layers)`} />
      <path d="M179 109c-35-36-43 17-38 53-16 40 0 55 39 55s55-15 39-55c5-36-3-89-40-53" fill="#fcf7ea" />
      <circle cx="157" cy="101" r="4" fill="#193c40" /><circle cx="203" cy="101" r="4" fill="#193c40" /><path d="m167 122 13 16 13-16Z" fill="#d38a4b" />
    </g>}
    {product.shape === 'lighthouse' && <g>
      <ellipse cx="180" cy="229" rx="64" ry="13" fill="#a8b2a8" /><path d="m147 216 11-128h44l11 128Z" fill="#fffaf0" />
      <path d="m155 126-3 36h56l-3-36m-56 72-2 18h66l-2-18" fill={paint} />
      <path d="M147 88h66v9h-66zM155 54h50v34h-50z" fill="#294f54" /><path d="M165 59h30v22h-30z" fill="#f6d59b" />
      <path d="m147 54 33-24 33 24Z" fill={product.color} /><path d="M175 177h10v13h-10z" fill="#294f54" /><path d="M147 216h66v7h-66z" fill="#294f54" />
    </g>}
    {product.shape === 'planter' && <g>
      <path d="M180 144c-11-48-48-35-45-77 40-4 40 33 45 56 0-51 28-49 27-88 37 27 2 64-20 91 26-41 40-15 59-45 15 40-38 44-59 63" fill="#466f55" />
      <path d="m114 142 15 83q51 20 102 0l15-83Z" fill={paint} /><ellipse cx="180" cy="142" rx="66" ry="16" fill={product.color} /><ellipse cx="180" cy="140" rx="54" ry="10" fill="#535646" />
      <path d="m114 148 38 78 28-68 26 68 40-78m-94 78 28-68 26 68" fill="none" stroke="#fff" strokeOpacity=".24" strokeWidth="2" /><path d="M180 112v31" stroke="#466f55" strokeWidth="8" />
    </g>}
    {product.shape === 'keyring' && <g transform="rotate(-14 180 140)">
      <circle cx="180" cy="72" r="33" fill="none" stroke="#8c9896" strokeWidth="9" /><circle cx="180" cy="72" r="33" fill="none" stroke="#edf1ed" strokeWidth="3" />
      <rect x="127" y="106" width="106" height="122" rx="27" fill={paint} /><circle cx="180" cy="119" r="7" fill={product.background} /><path d="M180 94v24" stroke="#a0abaa" strokeWidth="7" />
      <path d="m140 185 26-40 18 25 12-15 26 30Z" fill="#fff5e0" /><path d="m155 163 11-18 13 18-12-6Z" fill="#fff" /><path d="M149 199h62" stroke="#fff5e0" strokeWidth="3" strokeLinecap="round" />
    </g>}
    {product.shape === 'mountain' && <g>
      <path d="m72 214 65-106 27 42 42-93 86 157Z" fill={paint} /><path d="m137 108 27 42-29 63H72Zm69-51 86 157h-64Z" fill="#fff" opacity=".15" />
      <path d="m110 153 27-45 25 41-23-8-10 11-8-7m63-43 22-45 24 44-18-7-9 10-10-7" fill="#fffaf0" /><path d="M68 215h228v15H68z" fill={product.color} />
    </g>}
    {product.shape === 'holder' && <g>
      <path d="m121 223 31-121 32 8-24 91h89v22Z" fill={paint} /><path d="m160 201 24-91 21-10-23 96 67 5Z" fill={product.color} />
      <g transform="rotate(14 181 132)"><rect x="137" y="49" width="96" height="157" rx="12" fill="#23484c" /><rect x="143" y="57" width="84" height="136" rx="7" fill="#dce5df" /><path d="m143 163 34-49 23 26 27-39v92h-84Z" fill="#8da99a" /><circle cx="209" cy="83" r="11" fill="#e6bb7e" /><path d="M170 63h30" stroke="#23484c" strokeWidth="5" strokeLinecap="round" /></g>
      <path d="M126 208h46v22h-46z" fill={product.color} />
    </g>}
  </svg>
}
