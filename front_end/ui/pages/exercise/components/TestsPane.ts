import './TestsPane.scss';
import {LitElement, html, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import bind from '@/utils/bind';
import { getPartnerID, runCode, submitCode } from '@/utils/exercise-service';
import bulmaCollapsible from '@creativebulma/bulma-collapsible';


enum TestStatus {
	Unknown = 'unknown',
	Running = 'running',
	Passed = 'passed',
	Failed = 'failed',
}

interface Test {
	name: string;
	test_id: number
	after_code: string;
	before_code: string;
	can_see_code_output: boolean;
	can_see_expected_output: boolean;
	can_see_test_code: boolean;
	instructions: string;
	jpg_output: unknown
	txt_output: string;
	status: TestStatus;
}

const { exercise_details, exercise_basics, course_basics, assignment_basics, users } = window.templateData;

users?.sort();

@customElement('tests-pane')
export class TestsPane extends LitElement {
	@property()
	addSubmission?: (submission: Submission) => void;

	private getCode?: () => string;

	@state()
	tests: Test[];

	@state()
	testOutputs: {[key: string]: {
		txt_output: string;
		jpg_output: string;
		diff_output: string;
	}} = {};

	@state()
	private errorMessage: string = '';

	@state()
	private peerProgrammingModalOpen: boolean = false;

	constructor() {
		super();
		this.tests = [];
		const testMap = exercise_details.tests;
		for (const testName in testMap) {
			if (testMap.hasOwnProperty(testName)) {
				const test = testMap[testName];
				test.name = testName;
				test.status = TestStatus.Unknown;
				this.tests.push(test);
			}
		}
		this.tests.sort((a, b) => a.test_id - b.test_id);
	}

	render() {
		let testsRunning = this.tests.some(test => test.status === TestStatus.Running);
		return html`
			<div class="tests-pane">
				<div class="tests-header">
					<p>Tests</p>
					<div class="field is-grouped">
						<p class="control">
							<button ?disabled=${testsRunning} class="button is-primary is-outlined" @click=${() => this.runCode()}>Run all</button>
						</p>
						<div class="field has-addons">
							<!-- <p class="control">
								<button class="button">
									<i class="fab fa-product-hunt"></i>
									<span style="margin: 0 6px;">Select partner</span>
									<i class="fas fa-caret-down"></i>
								</button>
							</p> -->
							<p class="control">
								<button ?disabled=${testsRunning} class="button is-dark" @click=${() => this.handleSubmit()}>Submit</button>
							</p>
						</div>
					</div>

				</div>
				${this.errorMessage?.length > 0 ? html`
					<article class="message is-danger">
						<div class="message-header">
							<p>An error occurred while your code was being processed.</p>
							<button class="delete" aria-label="delete" @click=${() => this.errorMessage = ''}></button>
						</div>
						<div class="message-body">
							${unsafeHTML(this.errorMessage)}
						</div>
					</article>
				` : null}
				<table class="table is-fullwidth is-hoverable" style="margin-bottom: 20px;">
					<thead>
						<tr>
							<th>Status</th>
							<th style="width: 100%;">Test</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						${this.tests.map((test) => html`
							<tr class=${test.status} @click=${this.clickRow}>
								<td class="test-status">${this.getStatusIcon(test.status)}</td>
								<td>${test.name}</td>
								<td>
									<test-results-modal
										.test=${test}
										.runTest=${this.runCode}
										.testStatus=${test.status}
										.expectedOutput=${test.txt_output}
										.expectedImageOutput=${test.jpg_output}
										.imageDiff=${this.testOutputs[test.name]?.diff_output ?? ''}
										.userOutput=${this.testOutputs[test.name]?.txt_output ?? ''}
										.userImageOutput=${this.testOutputs[test.name]?.jpg_output ?? ''}
									></test-results-modal>
								</td>
							</tr>
						`)}
					</tbody>

				</table>
			</div>
			<peer-programming-modal
				.open=${this.peerProgrammingModalOpen}
				.onClose=${() => this.peerProgrammingModalOpen = false}
				.onSubmit=${this.submitCode}
			></peer-programming-modal>
		`;
	}


	@bind
	private clickRow(e: MouseEvent) {
		if (e.target instanceof Element) {
			if (e.target.nodeName === 'BUTTON') {
				return;
			}
			const modal: TestResultsModal | null = e.target.closest('tr')?.querySelector('test-results-modal') ?? null;
			if (modal) {
				modal.openModal();
			}
		}
	}

	private getStatusIcon(status: TestStatus): TemplateResult {
		switch (status) {
			case TestStatus.Passed:
				return html`<i class="fas fa-check passed has-tooltip-right" data-tooltip="Passed"></i>`;
			case TestStatus.Failed:
				return html`<i class="fas fa-times failed has-tooltip-right" data-tooltip="Failed"></i>`;
			case TestStatus.Running:
				return html`<i class="fas fa-spinner fa-spin running has-tooltip-right" data-tooltip="Running"></i>`;
			default:
				return html`<i class="fas fa-question unknown has-tooltip-right" data-tooltip="Run code to see result"></i>`;
		}
	}

	@bind
	private async runCode(testName?: string) {
		for (const test of this.tests) {
			if (!testName || testName === test.name) {
				test.status = TestStatus.Running;
			}
		}

		this.requestUpdate();
		
		const result = await runCode(course_basics.id, assignment_basics.id, exercise_basics.id, this.getCode!(), testName);
		this.processResult(result);
		this.requestUpdate();
	}

	@bind
	private async handleSubmit() {
		if (!exercise_details.enable_pair_programming) {
			await this.submitCode();
		}
		this.peerProgrammingModalOpen = true;
	}

	@bind
	private async submitCode(partnerID = '') {
		if (this.peerProgrammingModalOpen) {
			this.peerProgrammingModalOpen = false;
		}
		for (const test of this.tests) {
			test.status = TestStatus.Running;
		}

		this.requestUpdate();
		const code = this.getCode!();
		const result = await submitCode(course_basics.id, assignment_basics.id, exercise_basics.id, code, partnerID);
		this.processResult(result);

		this.requestUpdate();
		if (result.submission_id) {
			this.addSubmission?.({
				id: result.submission_id,
				date: new Date(),
				code,
				passed: !!result.all_passed,
			});
		}
	}

	private processResult(result: RunCodeResponse) {
		if (result.message?.length > 0) {
			for (const test of this.tests) {
				test.status = TestStatus.Failed;
			}
			this.errorMessage = result.message;
		} else {	
			for (const test of this.tests) {
				if (result.test_outputs[test.name]) {
					test.status = result.test_outputs[test.name]?.passed ? TestStatus.Passed : TestStatus.Failed;
				}
			}
			Object.assign(this.testOutputs, result.test_outputs);
		}
	}
}

@customElement('peer-programming-modal')
export class PeerProgrammingModal extends LitElement {
	@property()
	private open: boolean = false;

	@property()
	private onClose?: () => void;

	@property()
	private onSubmit?: (partnerName: string) => void;

	@state()
	private partner: string = '';

	render() {
		if (!this.open) {
			return null;
		}
		return html`
			<div class="modal is-active">
				<div class="modal-background" @click=${this.onClose}></div>
					<div class="modal-card">
						<header class="modal-card-head">
							<p class="modal-card-title">Peer programming</p>
							<button class="delete" aria-label="close" @click=${this.onClose}></button>
						</header>
						<section class="modal-card-body">
							<p>Select your pair programming partner here. If you are working on the exercise without a partner, leave this field blank.</p>
							<div class="select" style="margin: 16px 0px;">
								<select value=${this.partner} @change=${this.handleChange}>
									<option value="">Select partner...</option>
									${users?.map((user: string) => html`<option value=${user}>${user}</option>`)}
								</select>
							</div>

							<div class="field is-grouped">
								<p class="control">
									<button class="button is-primary is-outlined" @click=${this.submit}>Submit</button>
								</p>
							</div>
						</section>
					</div>
				</div>
			</div>
		`;
	}

	@bind
	handleChange(e: Event) {
		console.log(e);
		if (e.target instanceof HTMLSelectElement) {
			this.partner = e.target.value;
		}
	}

	@bind
	async submit() {
		let partnerID = '';
		if (this.partner) {
			partnerID = await getPartnerID(course_basics.id, this.partner);
			if (typeof partnerID !== 'string') {
				partnerID = '';
			}
		}
		this.onSubmit?.(partnerID);
	}
}

enum OutputTab {
	Plain = 'Plain Output',
	TextDiff = 'Text Diff',
	ImageDiff = 'Image Diff',
}

@customElement('test-results-modal')
export class TestResultsModal extends LitElement {
	@state()
	private open = false;

	@property()
	testStatus?: TestStatus;

	@property()
	test?: Test;

	@property()
	userOutput?: string;

	@property()
	expectedOutput?: string;

	@property()
	userImageOutput?: string;

	@property()
	expectedImageOutput?: string;

	@property()
	imageDiff?: string;

	@property()
	runTest?: (testName: string) => Promise<void>;

	
	@state()
	currentTab = OutputTab.Plain;
	
	tabOutputs: {[key in OutputTab]: () => TemplateResult} = {
		[OutputTab.Plain]: () => html`
			<div class="plain-output-section">
				<div>
					${this.testStatus === TestStatus.Passed ? html`<h2>Test passed 🎉!!!</h2>` : null}
					${this.getUserOutput()}
				</div>
				<div>
					${this.getExpectedOutput()}
				</div>
			</div>
		`,
		[OutputTab.TextDiff]: () => html`
			<div class="diff-section">
				<div class="diff-section-header">
					<span style="flex: 1;">Correct text output:</span>
					<span style="flex: 1;">Your text output:</span>
				</div>
				<diff-viewer .left=${this.expectedOutput} .right=${this.userOutput}></diff-viewer>
			</div>
		`,
		[OutputTab.ImageDiff]: () => html`
			<div class="image-diff-section">
				<img src='data:image/jpg;base64,${this.imageDiff}' width="100%" />
			</div>
		`,
	}

	render() {
		return html`
			<button class="button is-small" ?disabled=${this.testStatus === TestStatus.Running} @click=${() => this.runTest?.(this.test!.name)}>${this.getRunButtonText()}</button>
			<button class="button is-small" @click=${this.openModal}>View details</button>
			${this.open ? html`
				<div class="modal is-active">
					<div class="modal-background" @click=${this.closeModal}></div>
					<div class="modal-card">
						<header class="modal-card-head">
							<p class="modal-card-title">Test results: ${this.test?.name}</p>
							<button class="delete" aria-label="close" @click=${this.closeModal}></button>
						</header>
						<section class="modal-card-body">

							<div id="accordion">
								${this.test?.instructions ? html`
									<article class="message">
										<div class="message-header">
											<a href="#instruction-section" data-action="collapse">Instructions</a>
										</div>
										<div id="instruction-section" class="message-body is-collapsible is-active" data-parent="accordion">
											<div class="message-body-content">
												${unsafeHTML(this.test?.instructions)}
											</div>
										</div>
									</article>
								` : null}
								
								${this.test?.can_see_test_code ? html`
								<article class="message">
									<div class="message-header">
										<a href="#test-code-section" data-action="collapse">Test code</a>
									</div>
									<div id="test-code-section" class="message-body is-collapsible is-active" data-parent="accordion">
										<div class="message-body-content">
											${this.test?.before_code ? html`
												<p>Code run before your code:</p>
												<pre>${this.test?.before_code}</pre>
											` : null}
											${this.test?.after_code ? html`
												<p>Code run after your code:</p>
												<pre>${this.test?.after_code}</pre>
												` : null}
											${!!this.test?.before_code && !!this.test?.after_code ? html`
												<p>No additional code is run before or after your code.</p>
											` : null}
										</div>
									</div>
								</article>
								` : html`
									<article class="message">
										<div class="message-header">
											<p disabled>Test code is hidden for this test</p>
										</div>
									</article>
								`}
								${this.test?.can_see_expected_output || this.test?.can_see_code_output ? html`
									<article class="message grow">
										<div class="message-header">
											<a href="#output-section" data-action="collapse">Code output</a>
										</div>
										<div id="output-section" class="message-body is-collapsible is-active" data-parent="accordion">
											<div class="message-body-content">
												${this.getTestOutput()}
											</div>
										</div>
									</article>
								` : html`
									<article class="message">
										<div class="message-header">
											<p disabled>You cannot see any output from this test.</p>
										</div>
									</article>
								`}
							</div>
						</section>
					</div>
				</div>		
			` : null}
		`;
	}

	@bind
	public async openModal() {
		this.open = true;
		await this.updateComplete;
		bulmaCollapsible.attach('.is-collapsible');
	}

	@bind
	closeModal() {
		this.open = false;
	}

	@bind
	private getRunButtonText(): string | TemplateResult {
		switch (this.testStatus) {
			case TestStatus.Running:
				return html`Run test <i class="fas fa-spinner fa-spin running"></i>`;
			case TestStatus.Passed:
			case TestStatus.Failed:
			case TestStatus.Unknown:
				return html`Run test <i class="fas fa-play"></i>`;
			default:
				return '';
		}
	}

	@bind
	private getTestOutput(): TemplateResult {
		const tabs: OutputTab[] = [OutputTab.Plain];
		if (this.test?.can_see_code_output && this.test?.can_see_expected_output) {
			switch (this.testStatus) {
				case TestStatus.Failed:
					tabs.push(OutputTab.TextDiff);
					if (this.imageDiff) {
						tabs.push(OutputTab.ImageDiff);
					}
					break;
				case TestStatus.Running:
					return html`<h3>Currently running.</h3>`;
				default:
					break;
			}
		}

		if (tabs.length === 1) {
			return this.tabOutputs[tabs[0]]();
		}

		if (!tabs.includes(this.currentTab)) {
			this.currentTab = tabs[0];
		}

		return html`
			<div>
				<div class="tabs">
					<ul>
						${tabs.map(tab => html`
							<li class=${tab === this.currentTab ? 'is-active' : ''} @click=${() => this.currentTab = tab}><a>${tab}</a></li>
						`)}
					</ul>
				</div>
			</div>
			${this.tabOutputs[this.currentTab]()}				
		`;
	}

	private getUserOutput(): TemplateResult {
		if (this.testStatus === TestStatus.Unknown) {
			return html`<h3>This test has not been run yet, so you have no output.</h3>`;
		}
		if (!this.test?.can_see_code_output) {
			return html`<h3>You cannot see your output for this test.</h3>`;
		}
		return html`
			<h3>Your output:</h3>
			${this.userOutput ? html`
				<pre>${this.userOutput}</pre>
			` : null}
			${this.userImageOutput ? html`
				<img src='data:image/jpg;base64,${this.userImageOutput}' width="100%" />
			` : null}		
		`;
	}

	private getExpectedOutput(): TemplateResult {
		if (this.testStatus === TestStatus.Passed) {
			return html``;
		}
		if (!this.test?.can_see_expected_output) {
			return html`<h3>You cannot see the expected output for this test.</h3>`;
		}
		return html`
			<h3>Correct output:</h3>
			${this.expectedOutput ? html`
				<pre>${this.expectedOutput}</pre>
			` : null}
			${this.expectedImageOutput ? html`
				<img src='data:image/jpg;base64,${this.expectedImageOutput}' width="100%" />
			` : null}		
		`;		
	}
}
