type PlanErrorProps = {
  message: string;
  retryHref: string;
};

export default function PlanError({
  message,
  retryHref,
}: PlanErrorProps) {
  return (
    <section className="card approach-card" role="alert">
      <h2>Your plan couldn’t load.</h2>
      <p>{message}</p>
      <a className="button-link" href={retryHref}>
        Try again
      </a>
    </section>
  );
}