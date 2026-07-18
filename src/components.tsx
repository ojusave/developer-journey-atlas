import type { ReactNode } from "react";

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  autoComplete?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
        autoComplete={autoComplete}
      />
    </div>
  );
}

export function TextArea({
  id,
  label,
  value,
  onChange,
  hint,
  rows = 5,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
      />
    </div>
  );
}

export function ChoiceGroup({
  legend,
  value,
  choices,
  onChange,
}: {
  legend: string;
  value: string;
  choices: string[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      <div className="choice-list">
        {choices.map((choice) => (
          <label className={value === choice ? "choice is-selected" : "choice"} key={choice}>
            <input
              type="radio"
              name={legend}
              value={choice}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            <span>{choice}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MultiChoiceGroup({
  legend,
  values,
  choices,
  onChange,
  max,
  hint,
  exclusiveChoices = [],
}: {
  legend: string;
  values: string[];
  choices: string[];
  onChange: (values: string[]) => void;
  max?: number;
  hint?: string;
  exclusiveChoices?: string[];
}) {
  function toggle(choice: string) {
    if (values.includes(choice)) {
      onChange(values.filter((value) => value !== choice));
      return;
    }
    if (exclusiveChoices.includes(choice)) {
      onChange([choice]);
      return;
    }
    if (values.some((value) => exclusiveChoices.includes(value))) {
      onChange([choice]);
      return;
    }
    if (max && values.length >= max) return;
    onChange([...values, choice]);
  }

  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      {hint ? <p className="field-hint">{hint}</p> : null}
      <div className="choice-list">
        {choices.map((choice) => {
          const selected = values.includes(choice);
          const disabled = Boolean(max && values.length >= max && !selected);
          return (
            <label className={selected ? "choice is-selected" : "choice"} key={choice}>
              <input
                type="checkbox"
                value={choice}
                checked={selected}
                disabled={disabled}
                onChange={() => toggle(choice)}
              />
              <span>{choice}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuestionShell({
  eyebrow,
  title,
  support,
  children,
}: {
  eyebrow: string;
  title: string;
  support?: string;
  children: ReactNode;
}) {
  return (
    <section className="question-shell" aria-labelledby="question-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="question-title" tabIndex={-1}>{title}</h1>
      {support ? <p className="question-support">{support}</p> : null}
      <div className="question-body">{children}</div>
    </section>
  );
}

export function WhyThisQuestion({ children }: { children: ReactNode }) {
  return (
    <details className="why-this-question">
      <summary>Why this question?</summary>
      <div>{children}</div>
    </details>
  );
}
