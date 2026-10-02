"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    number: "01",
    title: "Pick a role",
    description:
      "Choose the role and experience level you're targeting — frontend, backend, or full-stack.",
  },
  {
    number: "02",
    title: "Answer live questions",
    description:
      "Work through 5 real interview questions, mixing behavioral, technical, and system design.",
  },
  {
    number: "03",
    title: "Get instant feedback",
    description:
      "See AI feedback stream in on clarity, structure, and content — scored, not just described.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="max-w-6xl mx-auto px-6 py-24 border-t border-border-soft"
    >
      <span className="font-mono text-xs tracking-widest text-accent uppercase">
        The flow
      </span>
      <h2 className="mt-3 font-display text-3xl text-foreground">
        Three steps, no fluff.
      </h2>

      <div className="mt-12 grid md:grid-cols-3 gap-10">
        {STEPS.map((step, index) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <span className="font-mono text-sm text-muted">{step.number}</span>
            <h3 className="mt-2 text-xl text-foreground font-medium">
              {step.title}
            </h3>
            <p className="mt-2 text-muted leading-relaxed">
              {step.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
