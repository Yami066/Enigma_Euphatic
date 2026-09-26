import { Scale } from "lucide-react";

interface Props {
  citation: string;
  source?: string;
  className?: string;
}

export function CitationBlock({ citation, source, className = "" }: Props) {
  return (
    <div className={`citation-box ${className}`}>
      <div className="flex items-start gap-2">
        <Scale className="mt-0.5 size-4 shrink-0 text-[#ACA986]" />
        <div>
          <p>{citation}</p>
          {source && (
            <span className="mt-1 block font-mono text-[11px] font-semibold tracking-wide text-[#4F3F38] not-italic">
              REFERENCE: {source}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
