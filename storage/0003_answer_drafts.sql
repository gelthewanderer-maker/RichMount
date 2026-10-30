CREATE TABLE `classroom_answer_drafts` (
	`student_id` text NOT NULL,
	`draft_key` text NOT NULL,
	`device_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`previous_payload` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `classroom_students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_draft_owner_device` ON `classroom_answer_drafts` (`student_id`,`draft_key`,`device_id`);--> statement-breakpoint
CREATE INDEX `answer_draft_owner` ON `classroom_answer_drafts` (`student_id`);