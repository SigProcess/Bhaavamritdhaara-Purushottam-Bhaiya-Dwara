export default function PetalsLayer() {
  const petals = Array.from({ length: 14 }, (_, i) => {
    const left = Math.random() * 100
    const delay = Math.random() * 20
    const dur = 12 + Math.random() * 18
    const size = 8 + Math.random() * 10
    const hue = Math.random() > 0.5
      ? 'rgba(141,170,145,0.7)'
      : 'rgba(212,175,55,0.5)'
    return (
      <div
        key={i}
        className="petal"
        style={{
          left: `${left}%`,
          top: '-5%',
          width: size,
          height: size * 1.5,
          background: hue,
          animationDuration: `${dur}s`,
          animationDelay: `${delay}s`,
          animationName: 'petalDrift',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          borderRadius: '60% 40% 60% 40%',
          transform: `rotate(${Math.random() * 60 - 30}deg)`,
        }}
      />
    )
  })
  return <div className="petals-container">{petals}</div>
}
