import Link from "next/link";
import type { IndexedQuestion } from "@/lib/content/quiz-index";

/**
 * One question, server-rendered with its answer present in the HTML but
 * collapsed behind a native <details>. Collapsed content is indexed normally,
 * so the page carries its answers for search without spoiling them, and it
 * works with JavaScript disabled.
 *
 * Styling lives in globals.css under .qz — this markup repeats hundreds of
 * times per page and Tailwind class strings on every node were the difference
 * between a 300 KB page and a 3 MB one.
 */
export function QuestionCard({ question }: { question: IndexedQuestion }) {
  const { type, options, answer, verse_reference, readHref } = question;

  const shown =
    type === "true_false"
      ? answer.toLowerCase() === "true"
        ? "True"
        : "False"
      : answer;

  return (
    <li className="qz">
      <p className="qz-q">{question.question}</p>
      {type === "multiple_choice" && options && options.length > 0 && (
        <p className="qz-opts">{options.join("  ·  ")}</p>
      )}
      {type === "true_false" && <p className="qz-opts">True or false?</p>}
      <details>
        <summary>Show answer</summary>
        <p className="qz-a">{shown}</p>
        {verse_reference && <p className="qz-ref">{verse_reference}</p>}
        <Link className="qz-go" href={readHref}>
          Read it in context →
        </Link>
      </details>
    </li>
  );
}
