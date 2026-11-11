CREATE TYPE "public"."admin_transfer_status" AS ENUM('pending', 'accepted', 'cancelled', 'declined');--> statement-breakpoint
CREATE TABLE "admin_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_membership_id" uuid NOT NULL,
	"status" "admin_transfer_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_transfer" ADD CONSTRAINT "admin_transfer_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_transfer" ADD CONSTRAINT "admin_transfer_to_membership_id_membership_id_fk" FOREIGN KEY ("to_membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_transfer_to_idx" ON "admin_transfer" USING btree ("to_membership_id","status");