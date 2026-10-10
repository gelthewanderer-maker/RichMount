CREATE TABLE `classroom_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classroom_students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code_hash` text NOT NULL,
	`encrypted_code` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_code_hash` ON `classroom_students` (`code_hash`);--> statement-breakpoint
CREATE TABLE `classroom_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`client_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`score` integer,
	`total` integer,
	`words` integer,
	`created_at` text NOT NULL,
	`reviewed` integer DEFAULT 0 NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`teacher_score` text,
	`reviewed_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `classroom_students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_client_submission` ON `classroom_submissions` (`student_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `submission_time` ON `classroom_submissions` (`created_at`);