import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundRoute() {
  return (
    <div className="page-container max-w-xl py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">That page is not on the ballot.</h1>
      <p className="mt-4 text-muted-foreground">Check the URL or return to BirdLoud.</p>
      <Link className={buttonVariants({ className: "mt-7" })} to="/">Go home</Link>
    </div>
  );
}
