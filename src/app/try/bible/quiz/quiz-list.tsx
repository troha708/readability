"use client";

import { useState } from "react";
import Link from "next/link";
import type { IndexedQuestion } from "@/lib/content/quiz-index";

/**
 * The questions on a hub, section, or book page — answered the same way as in
 * Study mode: pick an option, or type the missing word. Laid out as a list
 * rather than a stepper so every question is present in the server-rendered
 * HTML; a stepper would put one question in the markup and hide the rest
 * behind client state, which is the whole reason these pages exist.
 *
 * Grading matches the chapter quiz: case-insensitive, trimmed, and accepting
 * the `accept` variants (the same word as other translations render it).
 */

function normalize(s: string) {
  return s.toLowerCase().trim();
}

function acceptedAnswers(q: IndexedQuestion): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [q.answer, ...(q.accept ?? [])]) {
    const key = normalize(a);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

type Answered = { given: string; correct: boolean };

export function QuizList({ questions }: { questions: IndexedQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, Answered>>({});

  function submit(q: IndexedQuestion, given: string) {
    if (!given.trim() || answers[q.id]) return;
    const correct = acceptedAnswers(q).some((a) => normalize(a) === normalize(given));
    setAnswers((prev) => ({ ...prev, [q.id]: { given, correct } }));
  }

  return (
    <ol className="qz-list">
      {questions.map((q) => (
        <QuestionItem key={q.id} question={q} answered={answers[q.id]} onAnswer={submit} />
      ))}
    </ol>
  );
}

function QuestionItem({
  question: q,
  answered,
  onAnswer,
}: {
  question: IndexedQuestion;
  answered?: Answered;
  onAnswer: (q: IndexedQuestion, given: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const done = Boolean(answered);
  const options =
    q.type === "multiple_choice" ? q.options : q.type === "true_false" ? ["True", "False"] : null;

  function optionClass(option: string): string {
    if (!done) return "qz-opt";
    if (normalize(option) === normalize(q.answer)) return "qz-opt is-correct";
    if (option === answered!.given) return "qz-opt is-wrong";
    return "qz-opt is-muted";
  }

  return (
    <li className="qz">
      <p className="qz-q">{q.question}</p>

      {options && options.length > 0 && (
        <div className="qz-opts-wrap">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={done}
              className={optionClass(option)}
              onClick={() => onAnswer(q, option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {!options && (
        <form
          className="qz-fill"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(q, typed);
          }}
        >
          <input
            className="qz-input"
            value={done ? answered!.given : typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={done}
            placeholder="Type your answer"
            aria-label="Your answer"
          />
          <button className="qz-check" type="submit" disabled={done || !typed.trim()}>
            Check
          </button>
        </form>
      )}

      {done && (
        <p className={answered!.correct ? "qz-fb is-correct" : "qz-fb is-wrong"}>
          {answered!.correct ? "Correct." : `Answer: ${q.answer}`}
          {q.verse_reference ? ` — ${q.verse_reference}` : ""}{" "}
          <Link className="qz-go" href={q.readHref}>
            Read
          </Link>
        </p>
      )}
    </li>
  );
}
