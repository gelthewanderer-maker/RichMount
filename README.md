# Richmount IELTS Studio and Teacher Classroom

Richmount IELTS practice for Teacher Angelo’s learners, with online submissions and a private teacher dashboard.

## Student experience

The existing student address stays `https://richmount-ielts.onrender.com/`.
Students use **Your class** to enter an individual code provided by their teacher.
After joining, completed writing, reading, listening and speaking-note activities are sent to the teacher. Mock sections are shared only when the full mock ends. Drafts save on the device immediately and back up automatically to the student account.

If a request fails, an outbox retains completed work for a retry. **My progress** shows acknowledged submissions and the teacher’s feedback. Existing activities can be sent individually. Codes should be kept private because each code opens the assigned student’s online records.

## Teacher experience

The separate Render classroom web service serves the private dashboard at `/#teacher` on its actual Render origin. A teacher password is required for every teacher API operation.

- Add the 10 learner names together, one per line, in **Students & class codes**.
- Give each learner the usual student link and only their own code.
- Filter the submission inbox by student, skill and review status.
- Open original essays or all answers with recomputed practice marks.
- Save individual feedback and an optional teacher mark; students can read it in My progress.
- Download individual work. Change the teacher password from the dashboard.

Teacher sessions use signed, Secure, HttpOnly cookies. Passwords use scrypt hashes. Student codes are encrypted at rest. Students cannot list classmates, access other students’ submissions or call teacher endpoints. Changing the teacher password invalidates other teacher sessions.

## Lesson materials

**Lesson materials** contains the uploaded Reading and Listening courses, organised by lesson day. The Course selector lets students and teachers choose Reading, Listening or all resources. There are 251 files: 82 student documents, 82 uploaded audio recordings, one video, 76 private teacher guides and 10 private answer keys. The newest collection adds 39 Reading student books, 39 Reading teacher guides, two Reading exam papers and four answer keys. Reading Day 19 has not been supplied; Listening Days 7, 16 and 36 have not been supplied.

Students join with their individual class code to open or download books and play uploaded recordings. Listening uses the papers and recordings from the Listening course. Reading resources have their own course groups and do not inherit Listening recordings with the same day number.

The teacher dashboard's **Learning Materials** tab includes every course file. Teacher guides and answer keys are private by default. Each file has a **Student access** button: choose teacher only, the whole class or selected active students, then Save access. Existing student books and recordings remain shared with the class until the teacher changes their access. Copy student link shares a link to that material on the student site; the student's individual class code is still required. Teacher resources and audio binaries are kept separately from the public GitHub repository and streamed through the classroom service, so browsers receive the Richmount Render address.

Material permissions are stored durably in the classroom settings. The student's authenticated catalogue includes only files their code may open, and permissions are checked both when issuing a link and on every playback/download request. Removing access invalidates previously issued links. Downloaded copies cannot be recalled. Switching class codes clears cached and delayed catalogues so selected access cannot expose private filenames to another learner. Students can choose Refresh materials to see newly shared files.

The teacher **Listening Lab** opens at `/#teacher/listening`. The sidebar Listening lab link on the teacher host opens this same dashboard tab. It uses the teacher session to play the eight practice tests and diagnostic/final recordings and open their papers, guides and answer keys. A student class code is not required, and saved student mock attempts do not block this view. Student Listening lab access continues to use the student's individual class code.

The file catalogue lives in `materials/catalog.json`. Binary files are kept in the existing private storage service’s managed bucket, with size and SHA-256 verification. Never commit teacher slide files, private storage credentials or student codes. File links are scoped to one resource and expire after three hours; open the player again to refresh an expired link. No new Render environment variables are required.

To apply the materials update, extract the update ZIP and upload its contents to this repository’s root, preserving the `dist`, `server`, `tests` and `materials` folders. Commit to `main`, then deploy the classroom service followed by the static student service. The student and teacher URLs remain unchanged.

## Official IELTS preparation

**Official IELTS practice** opens at `/#official` for students and `/#teacher/official` for teachers. It includes a purpose selector for university and professional registration, work and migration, and UKVI requirements; eight official IELTS.org Listening samples with matching transcript and answer-key links; the official complete Listening computer demo; British Council practice tests; and Cambridge IELTS 21, the latest official collection found in the October 13, 2026 source check (published July 2026).

The recordings and scripts open on the IELTS partners' websites. Cambridge book and Digital Pack access is separate from the app. Official samples are marked as current resources checked on that date, not newly published or predictions of live exam scripts. Academic and General Training Reading and Writing remain distinct. This area is linked from Listening lab, Study guides, and Mock test and does not send external test results to the class inbox.

The checked release preload applies the six frontend and renderer-check files through `RICHMOUNT_OFFICIAL_UPDATE_COUNT` and its numbered parts after the existing course, starting-date, and attendance releases. Earlier layers recognise the official release hashes on repeated startup; the loader refuses to overwrite unrecognised later source edits.

## Vocabulary study

The **Vocabulary** navigation link opens `/#vocabulary`. Students can use a searchable Word bank, Flashcards, Practice quiz and Saved words. The original collection contains 120 words across ten topics, with clear meanings, two useful collocations and a contextual example for every word. Quizzes contain up to ten questions and show explanations after an answer is checked.

Saved words, learned-word markers and quiz bests persist on the current browser. Joined learners have separate progress keyed by their student ID; guest study uses a separate guest record. Vocabulary practice is not sent to the teacher inbox or included in mock-test scores.

The collection is in `dist/vocabulary-data.js`; the study interface and styles are in `dist/vocabulary.js` and `dist/vocabulary.css`. No vocabulary service or external API is required.


## Hosting and durable storage

The static student site remains on the existing Render service. The new dependency-free Node web service uses the free plan. It must bind to `0.0.0.0:$PORT` and use `npm start`.

The classroom uses a managed durable database through the existing owner-private storage Site. The backend uses protected server-to-server requests; database credentials and service access tokens never go to a browser. The storage Site must remain owner-private. Its schema and storage operation contract are mirrored under `storage/`; production migrations live with that Site’s source.

Set `CLASSROOM_API_URL` on the static site to the exact classroom origin returned by Render. The build writes only this public origin into `dist/classroom-config.js`. The classroom service uses Render’s `RENDER_EXTERNAL_URL` for its own origin. For other environments, use `CLASSROOM_APP_URL`.

Configure these **server-only** environment variables on the classroom web service:

| Key | Value |
| --- | --- |
| `CLASSROOM_STORE_URL` | Existing private storage Site’s origin |
| `CLASSROOM_STORE_TOKEN` | Sites service access token, sent only to that Site |
| `STORE_API_KEY` | Matching secret configured on the storage Site |
| `TEACHER_PASSWORD_HASH` | Initial scrypt password hash |
| `TEACHER_SESSION_SECRET` | Random session signing secret, at least 40 characters |
| `CLASSROOM_ENCRYPTION_KEY` | Random 32-byte key encoded as 64 hexadecimal characters |

Keep the encryption and signing keys stable across deploys. Generate the initial teacher password securely and deliver it only to the teacher; never put it in this repository. Password changes are stored durably in the database. No database files are written to Render’s temporary filesystem.


## Class sessions and manual pay

Launch class session opens a short form for the date, a directly typed 12-hour time, and the session name. Hours and pay are optional at launch. Student attendance opens as a list with Present, Excused, and Absent buttons; each tap saves automatically, and rapid taps are queued without dropping statuses. The screen uses full-width touch controls and session cards on phones.

My hours & pay accepts the teacher's hours worked and amount per hour directly. Only the session total and monthly totals are calculated. There is no timer or finish-time step in this interface. Changing a student's attendance does not change pay or silently save unfinished payment edits. Saved legacy records retain their previous exact-minute totals until the teacher explicitly edits the hours.


## Checks

Run `npm run check` and `npm test` with Node 22.13 or newer. No packages need to be installed.

Tests cover the existing practice and mock flows plus private teacher access, independent student codes, student record isolation, marking from submitted answers, duplicate retries, feedback visibility, Unicode names, SQL parameterization, password changes, records after server restart, private storage access, offline retries, switching identities and all sections queued together. Materials checks cover all 251 files, lesson matching, teacher/student separation, ticket signatures and expiry, revoked access, file types, downloads, native player controls and byte-range streaming.

Local browser QA was unavailable in the managed authoring environment. Verify the deployed join, teacher login and feedback flows once the updated files are uploaded.

## Practice limits

The built-in interactive activities are original practice, not official IELTS questions. Uploaded class books and recordings are separate course resources supplied by the teacher. Grammar feedback checks common errors; it does not provide an IELTS Writing band. Reading and Listening marks are not calibrated to official bands. Speaking submissions include preparation notes and optional audio uploads for teacher review. Mock test now opens the eight weekly mocks using the uploaded Practice Test 1–8 recordings with their matching papers. Listening lab lists the uploaded practice, diagnostic, and final recordings. Browser speech synthesis is not used. Older saved practice attempts retain their reports and can be saved as incomplete before switching. This is a learning tool, not a secure high-stakes exam.

## Speaking uploads and teacher audio

Joined students can record or choose a file in Speaking practice, then upload it to the teacher. Each saved speaking activity has three successful upload attempts, enforced in durable storage. Redo replaces the previous student recording. Delete removes the audio while retaining the attempt count; failed uploads do not count. Mock recordings can be uploaded after the mock ends, and earlier activities can be managed in My progress or Your class. Unsent local recordings can be deleted and rerecorded without using an upload attempt.

Teachers can add multiple audio feedback files to each submitted activity (up to 50), and publish shared recordings in the dashboard’s Audio library (up to 200). Each file is limited to 25 MB. Teachers can replace or delete their own attachments. Students have read access to shared class audio and their own feedback, and cannot modify teacher attachments. Original uploaded course books and audio remain in Lesson materials. Private audio is kept in the existing R2 bucket; metadata, deletion state and attempt counts are held in D1. Native players use expiring, file-specific links with byte-range playback through the classroom host.

## Student passwords

Students sign in with their individual student code and password. On first sign-in, or after a teacher reset, their code is the temporary password. They must enter it as their current password and choose/confirm a new password of 12–200 characters before accessing class resources. Later changes require the personal current password.

Teacher dashboard → Students → Reset password returns that student to the code-as-temporary-password step. Previous sessions and material/audio tickets are invalidated; work, points and attendance are retained. Passwords use salted scrypt hashes in a separate durable table, created automatically without changing existing student records. Browser storage retains a signed session token, never the password or a raw-code access credential. The checked release remains compatible with the existing Render deployment overlays.

## Books, interactive answers, and grading sheets

All 80 supplied PDF books and question papers open inside the app through a bundled PDF.js reader. Page controls, fit-to-width, zoom buttons, pinch zoom, and drag scrolling work without opening the phone’s native PDF screen. Teacher books use the same reader. Minimized audio is a 156 px dock with play/pause, expand, and close controls; minimization survives switching recordings.

Book activity maps are in `materials/book-activities.json`, tied to each original file’s SHA-256. Students choose an activity or tap its number on the book, click choices or enter answers, and submit. Additional page answers cover responses that need notes, a description, or a teacher check. Each signed-in student has separate saved drafts and an identity-bound retry queue. Marks are recomputed on the server; a retry retains the original acknowledged response. Teacher previews never create learner records.

Teacher dashboard → Grading sheets shows the latest result for each student and book activity, with an all-attempts option, course/student filters, review status, and CSV export. The existing durable submissions table stores answers and scores; no schema changes or student-record migration is required. Verified answer keys stay server-side before submission. Open-ended items and unverified or inconsistent keys are saved for review. Teachers can save verified keys in the book reader for future submissions, and review responses using the existing feedback and teacher-mark form.


## Guided writing and recoverable drafts

Writing practice and weekly writing homework include a saved planner, adaptable sentence frames, useful topic phrases, task-specific tips, and a four-criterion self-check. Students choose the format appropriate to the exact question: Academic tables/charts, processes, maps, the main Task 2 question types, or a General Training letter. Short homework keeps its assigned length; the guide separately explains the full IELTS minimums. A reflection field supports revisions after teacher feedback.

Responses and plans save immediately to stable, per-learner browser keys. Save draft now adds a recovery checkpoint. Recover saved drafts previews earlier copies before restoring and keeps the replaced response. Account backups sync through authenticated student endpoints, with separate copies per device, a previous server copy and monotonic revisions that reject delayed writes. Reopening retries unsynced writing; failed syncs and blocked browser storage have distinct visible messages. Download draft exports the current response and plan. Autosaving does not create a teacher submission or affect marks. Clear browser data only after a confirmed account backup or download. Timed mock writing retains recovery controls without in-test coaching.

Normal paste, clipboard keyboard shortcuts and text drops are blocked in student writing response boxes, including practice, homework, mocks and revisions. Planning fields and unrelated form controls remain usable. These client-side controls do not prove authorship or prevent retyping or deliberate browser bypasses. IME composition remains enabled.

The durable writing-draft table is declared in the storage Site schema; its additive migration must deploy before the classroom API update. The checked writing release is applied during the build check only. Runtime startup does not install or change writing-release files. Earlier release layers recognise verified writing-release checksums and leave them intact.

## Constructive automatic writing feedback

New writing submissions are transactionally queued in the private durable database with a draft eligibility time 60 minutes after server acceptance. Duplicate retries preserve the original deadline. The background runner claims a five-minute lease, processes at most five due jobs per call, caches identical AI reviews, and retries temporary failures with a saved backoff. Six failed attempts need teacher attention. Student endpoints check ownership and never return raw automatic reports. Generated reports remain private teacher drafts, preserve the original essay, and never publish teacher marks or overwrite teacher comments. Teacher Inbox identifies AI drafts ready for review. The teacher can add a draft to the editor without losing existing text, edit it, save privately, and explicitly publish. Students see only the teacher’s published text; unpublishing hides it again.

Reviews contain evidence-based encouragement, strengths, at most five priority local corrections with explanations, practical writing tips, and achievable revision goals. Only task context and writing go to Gemini; student names and sign-in details are not added as metadata. Students must remove personal or confidential details from their writing before it is submitted. AI suggestions can be wrong. Full essay rewrites are excluded. Existing daily API quotas and encrypted key settings remain in force.

Teacher Settings shows AI configuration and scheduler readiness. A saved Gemini API key is required. Use a free-tier Google AI Studio project without billing enabled to avoid API charges. The app cannot check the Google project’s billing tier. Gemini free quotas and availability can change. Free-tier inputs and outputs can be used to improve Google products and reviewed by people; only adult learners and non-personal, non-confidential writing are appropriate for this setup. API failure leaves writing and queued feedback safe. Student My progress shows review status and the final teacher-published feedback. Private AI drafts never trigger student notifications. Teacher submissions also provide a Copy for ChatGPT prompt for manual use with a ChatGPT subscription: copy the response back into the feedback editor, check it, and publish. This manual workflow uses no API key; automatic OpenAI API use would be billed separately.

Reliable unattended delivery requires an approved background scheduler. The existing free classroom service can sleep, so a browser timer or in-process timer is not used as a delivery guarantee. Set the same server-only RICHMOUNT_FEEDBACK_JOB_KEY (at least 40 random characters) on the classroom service and scheduler. The scheduler invokes POST /api/internal/feedback/run every minute. Set RICHMOUNT_FEEDBACK_SCHEDULER_ENABLED=true on the classroom only after the scheduler is active. The authenticated internal status endpoint reports readiness without revealing any key or student work. The proposed Render cron service uses the smallest compute plan; it must be explicitly approved before incurring new charges.

Automatic draft processing begins after 60 minutes; API queues, outages, quotas, or cold starts can delay preparation. Student delivery always waits for explicit teacher publication. No exact-to-the-second delivery guarantee is made. Activation does not retroactively assess old work.

## Current AI provider: Gemini

New writing reviews use gemini-3.5-flash-lite through Google’s GenerateContent API with structured JSON. Earlier encrypted OpenAI keys are preserved but never read or used as a fallback. Add the Gemini key in Teacher Settings, enable coaching, and confirm the adult-only and data-use notice. Gemini keys are separately encrypted; neither keys nor sign-in metadata appear in provider inputs or error messages. Incomplete or blocked results are not published; quota errors leave work saved for retry. Provider-format tests use simulated responses; a live Gemini request requires the teacher’s key. One-hour unattended delivery still requires the separately activated background scheduler.

## Feedback file attachments

Teacher Inbox submissions accept up to ten feedback files, each up to 10 MB: PDF, DOCX, UTF-8 text, PNG, JPEG and WebP. Uploads remain private until the teacher chooses Publish feedback. Publication saves the text and the selected file IDs atomically; a new upload to already published feedback remains private until included in a later publication. Save private draft unpublishes text and files. Files can also be published without a text comment. Removing a file revokes future downloads immediately.

Both file lists and downloads require an authenticated teacher session or the owning student's current session. Students can access only published files attached to their own reviewed submission. The private storage API requires the server secret; bucket keys and checksums are excluded from client metadata, and files download as attachments with no-store and nosniff headers. File extension/signature checks, bounded uploads, digest checks and atomic count limits prevent incomplete or excess uploads. These checks do not claim antivirus scanning.

The teacher feedback textarea permits copy, cut and paste, including Ctrl/Cmd keyboard shortcuts and Shift+Insert. Student response-box paste guards explicitly exclude the teacher feedback editor. Uploading or removing a file preserves unsaved pasted teacher feedback.

## Lesson books

Lesson books open as reading-only documents with page controls, zoom, pinch and drag. The per-lesson answer-activity sidebar, multiple-choice buttons, question hotspots and Submit activity option have been removed. Existing saved book answers and grading records remain intact; separate weekly mocks and homework keep their assessment controls.

## Automatic student answer backups

Reading and Listening responses, Speaking notes, practice mocks and each weekly homework/mock attempt now save immediately to stable per-student browser keys and sync to the private account database after a short typing pause (with a five-second maximum batching interval). Each account and activity/week is isolated. Online saves retain an earlier recovery copy and separate device copies; delayed writes cannot replace a newer revision. No expiry or automatic answer deletion is configured. Draft backups do not submit homework or change grades.

Opening an activity restores its account draft automatically when no pending local edits would be replaced. Offline work stays queued on the device and retries on reconnection, reopening and regular retry ticks. Logout waits for a final normal online save attempt; closing or backgrounding the page also requests a best-effort save. The visible status distinguishes local storage, online acknowledgement and pending connection. Only an acknowledged account backup is available on another device; browser-only work requires the original browser until synchronization succeeds. Speaking audio still requires the existing successful Upload recording action.

The storage Site adds the migration-owned `classroom_answer_drafts` table; deploy that additive migration before the classroom API and student interface. No existing student rows, submissions, grades or writing drafts are deleted.

## Source deployment

Production application code is tracked in the RichMount repository and deployed by the existing Render build commands. `NODE_OPTIONS` is cleared so no source-code preload runs at startup or during tests. Existing secret settings and datastore identities stay unchanged. Two private lesson/answer-key JSON datasets are excluded from the public repository; `scripts/prepare-private-data.mjs` restores only those JSON files from their existing configured data bundles, requires their exact reviewed SHA-256 hashes, and never loads or executes bundled source code.

## Reviewing earlier mock sections

Before submitting a weekly mock, students can use Back or the section buttons to reopen any section they have already reached. Responses remain editable and autosaved. Each section retains its own remaining time; switching sections pauses the clock, and resuming never grants a new timer. Older attempts can also reopen earlier sections for review; elapsed time from sections without an older saved countdown is not reset. Moving between sections does not submit the mock. Finish & send, or expiry of the final section’s running timer, submits the whole attempt. Submitted attempts keep the existing review workflow.

## Live classroom preview

Teacher dashboard → Live classroom shows active student names, the Richmount activity and mock section last reported by each student, entered-answer/word counts, and activity timestamps. Select a student to read the latest account-saved responses while they work. The teacher page refreshes about every 10 seconds while visible; signed-in student pages report their Richmount activity about every 15 seconds and after navigation. Away and stale connections are labelled. Offline or not-yet-synced edits do not appear until successfully saved.

Previews require the existing authenticated teacher session. Students cannot list classmates or read this endpoint. Student pages state that their teacher can view activity and saved answers. The feature does not capture the screen, camera, microphone, clipboard, or activity outside Richmount. Previewing does not grade, submit, change or publish student work. Both existing draft tables and separate per-tab activity records use the current private database; no existing answers are replaced by activity updates.
