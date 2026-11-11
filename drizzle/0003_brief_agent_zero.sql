CREATE TYPE "public"."balance_provenance" AS ENUM('prime', 'internal_estimate');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('food', 'venue', 'supplies', 'printing', 'transport', 'services', 'alcohol', 'gift_cards', 'other');--> statement-breakpoint
CREATE TYPE "public"."funding_request_status" AS ENUM('draft', 'submitted', 'awarded', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."funding_source_kind" AS ENUM('own_funds', 'projects_board', 'alcohol_initiative', 'conference_fund', 'department', 'safe', 'co_sponsor', 'donation', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_route" AS ENUM('undecided', 'odus_card', 'department_charge', 'prime_vendor', 'out_of_pocket');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('not_filed', 'filed', 'treasurer_approved', 'odus_approved', 'finance_approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TABLE "balance_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_year_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"provenance" "balance_provenance" NOT NULL,
	"as_of" date NOT NULL,
	"note" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_year_id" uuid NOT NULL,
	"event_id" uuid,
	"description" text NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"vendor" text,
	"planned_amount" integer,
	"actual_amount" integer,
	"route" "payment_route" DEFAULT 'undecided' NOT NULL,
	"incurred_on" date,
	"paid_by_user_id" text,
	"chartstring" text,
	"receipt_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "funding_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_year_id" uuid NOT NULL,
	"event_id" uuid,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"amount_requested" integer NOT NULL,
	"amount_awarded" integer,
	"status" "funding_request_status" DEFAULT 'draft' NOT NULL,
	"external_ref" text,
	"submitted_on" date,
	"decided_on" date,
	"notes" text,
	"filed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "funding_source_kind" DEFAULT 'other' NOT NULL,
	"notes" text,
	"deadlines" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"claimant_user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" "reimbursement_status" DEFAULT 'not_filed' NOT NULL,
	"concur_ref" text,
	"purchased_on" date NOT NULL,
	"filed_on" date,
	"paid_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_snapshot" ADD CONSTRAINT "balance_snapshot_board_year_id_board_year_id_fk" FOREIGN KEY ("board_year_id") REFERENCES "public"."board_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshot" ADD CONSTRAINT "balance_snapshot_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_board_year_id_board_year_id_fk" FOREIGN KEY ("board_year_id") REFERENCES "public"."board_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_paid_by_user_id_user_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_request" ADD CONSTRAINT "funding_request_board_year_id_board_year_id_fk" FOREIGN KEY ("board_year_id") REFERENCES "public"."board_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_request" ADD CONSTRAINT "funding_request_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_request" ADD CONSTRAINT "funding_request_source_id_funding_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."funding_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_request" ADD CONSTRAINT "funding_request_filed_by_user_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_claimant_user_id_user_id_fk" FOREIGN KEY ("claimant_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_year_idx" ON "balance_snapshot" USING btree ("board_year_id","as_of");--> statement-breakpoint
CREATE INDEX "expense_year_idx" ON "expense" USING btree ("board_year_id");--> statement-breakpoint
CREATE INDEX "expense_event_idx" ON "expense" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "funding_request_year_idx" ON "funding_request" USING btree ("board_year_id","status");--> statement-breakpoint
CREATE INDEX "reimbursement_status_idx" ON "reimbursement" USING btree ("status","purchased_on");