interface Props {
  content: string;
}

export default function UserMessage({ content }: Props) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[78%] bg-brand text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}
