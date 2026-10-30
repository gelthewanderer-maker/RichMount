CREATE TABLE `classroom_audio` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text,
	`student_id` text,
	`role` text NOT NULL,
	`attempt` integer,
	`category` text DEFAULT 'general' NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `classroom_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `classroom_students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speaking_audio_attempt` ON `classroom_audio` (`submission_id`,`role`,`attempt`);--> statement-breakpoint
CREATE INDEX `audio_submission` ON `classroom_audio` (`submission_id`);--> statement-breakpoint
CREATE INDEX `audio_library` ON `classroom_audio` (`role`,`category`);