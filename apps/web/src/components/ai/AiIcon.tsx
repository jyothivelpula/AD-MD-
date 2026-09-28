export default function AiIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/ai-assistant.png"
      alt="AI assistant"
      width={size}
      height={size}
      className={`object-contain select-none ${className}`}
      draggable={false}
    />
  );
}
