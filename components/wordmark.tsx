// 앱 이름 로고.
// 티켓의 절취선을 제목에서 한 번 더 반복해서, 카드와 로고가 같은 아이디어로 묶이게 한다.
// ROOM의 골드는 "새 약속" 버튼과 D-day 스텁에 쓰는 색과 같은 값이다.

export default function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const text = {
    sm: "text-[17px]",
    md: "text-[21px]",
    lg: "text-[26px]",
  }[size];

  const rule = { sm: "h-4", md: "h-5", lg: "h-6" }[size];

  return (
    <span
      className={`inline-flex items-center gap-[9px] font-[family-name:var(--font-archivo)] font-black tracking-[-0.02em] leading-none ${text} ${className}`}
    >
      <span className="text-[var(--tk-ink)]">PROMISE</span>
      {/* 절취선 */}
      <span
        aria-hidden="true"
        className={`w-0 border-l-2 border-dashed border-[var(--tk-line)] ${rule}`}
      />
      <span className="text-[var(--tk-gold)]">ROOM</span>
    </span>
  );
}
