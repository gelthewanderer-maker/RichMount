# Richmount IELTS Studio and Teacher Classroom

Richmount IELTS practice for Teacher Angelo’s learners, with online submissions and a private teacher dashboard.

## Student experience

The existing student address stays `https://richmount-ielts.onrender.com/`.
Students use **Your class** to enter an individual code provided by their teacher.
After joining, completed writing, reading, listening and speaking-note activities are sent to the teacher. Mock sections are shared only when the full mock ends. Drafts remain on the device.

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

**Lesson materials** contains the uploaded course files, grouped by their actual lesson day. It includes 20 student documents, 47 audio recordings and one video across 19 uploaded days. The recordings are matched to the lesson number printed in each book; Day 20 is Practice Test 4 and Day 21 is Lesson 17. Days 7 and 16 have not been supplied.

Students join with their existing individual class code, then open or download their books and use native audio/video controls. The **Listening lab** keeps its original interactive practice questions and links to the uploaded course materials.

The teacher dashboard’s **Lesson resources** tab includes the student materials and 19 teacher presentation decks. Teacher slides require a signed-in teacher session both to request and to use a download link. Student codes cannot open them. Files are stored separately from this public GitHub repository and streamed through the classroom service, so the browser only receives Richmount’s Render address.

The file catalogue lives in `materials/catalog.json`. Binary files are kept in the existing private storage service’s managed bucket, with size and SHA-256 verification. Never commit teacher slide files, private storage credentials or student codes. File links are scoped to one resource and expire after three hours; open the player again to refresh an expired link. No new Render environment variables are required.

To apply the materials update, extract the update ZIP and upload its contents to this repository’s root, preserving the `dist`, `server`, `tests` and `materials` folders. Commit to `main`, then deploy the classroom service followed by the static student service. The student and teacher URLs remain unchanged.

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

The current GitHub connection can read the selected RichMount repository but cannot push to it. Upload the updated source package before deploying. Auto-deploy stays off; after verifying the upload, configure the new service and trigger the affected deployments.

## Checks

Run `npm run check` and `npm test` with Node 22.13 or newer. No packages need to be installed.

Tests cover the existing practice and mock flows plus private teacher access, independent student codes, student record isolation, marking from submitted answers, duplicate retries, feedback visibility, Unicode names, SQL parameterization, password changes, records after server restart, private storage access, offline retries, switching identities and all sections queued together. Materials checks cover all 87 files, lesson matching, teacher/student separation, ticket signatures and expiry, revoked access, file types, downloads, native player controls and byte-range streaming.

Local browser QA was unavailable in the managed authoring environment. Verify the deployed join, teacher login and feedback flows once the updated files are uploaded.

## Practice limits

The built-in interactive activities are original practice, not official IELTS questions. Uploaded class books and recordings are separate course resources supplied by the teacher. Grammar feedback checks common errors; it does not provide an IELTS Writing band. Reading and Listening marks are not calibrated to official bands. Speaking submissions contain preparation notes; recordings remain on the student’s device. Built-in Listening practice uses synthetic speech unless a matching recording is loaded locally; uploaded class recordings play in Lesson materials. This is a learning tool, not a secure high-stakes exam.
