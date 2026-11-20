function ExerciseIcon({ size = 48, color = 'currentColor', className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Bench frame */}
      <rect x="14" y="33" width="36" height="2.5" rx="1.25" fill={color} />
      <rect x="16" y="35.5" width="2.5" height="8" rx="1" fill={color} />
      <rect x="45.5" y="35.5" width="2.5" height="8" rx="1" fill={color} />
      {/* Support uprights */}
      <rect x="44" y="8" width="2.5" height="27" rx="1" fill={color} />
      <rect x="46" y="8" width="6" height="2.5" rx="1" fill={color} />
      {/* Barbell bar */}
      <rect x="4" y="11" width="56" height="2" rx="1" fill={color} />
      {/* Weight plates */}
      <rect x="2" y="7" width="5" height="10" rx="1.5" fill={color} />
      <rect x="57" y="7" width="5" height="10" rx="1.5" fill={color} />
      {/* Person — torso */}
      <ellipse cx="30" cy="30" rx="13" ry="3" fill={color} />
      {/* Head */}
      <circle cx="44" cy="27.5" r="3.5" fill={color} />
      {/* Arms pressing up */}
      <line x1="22" y1="28" x2="18" y2="13" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="28" x2="42" y2="13" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Legs */}
      <line x1="18" y1="31" x2="12" y2="40" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="19" y1="31" x2="15" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default ExerciseIcon
