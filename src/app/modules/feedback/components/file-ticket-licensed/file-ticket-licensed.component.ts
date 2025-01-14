import {
  ChangeDetectionStrategy,
  Component, EventEmitter, Inject, Input, Output,
} from '@angular/core';
import { AbstractControl, FormBuilder, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import * as EmailValidator from 'email-validator';
import { finalize, of } from 'rxjs';
import {
  ticketAcceptedFiles,
  TicketCategory, ticketCategoryLabels,
  TicketCriticality, ticketCriticalityLabels,
  TicketEnvironment, ticketEnvironmentLabels,
} from 'app/enums/file-ticket.enum';
import { mapToOptions } from 'app/helpers/options.helper';
import { WINDOW } from 'app/helpers/window.helper';
import { helptextSystemSupport as helptext } from 'app/helptext/system/support';
import { FeedbackDialogComponent } from 'app/modules/feedback/components/feedback-dialog/feedback-dialog.component';
import { FeedbackService } from 'app/modules/feedback/services/feedback.service';
import { FormErrorHandlerService } from 'app/modules/ix-forms/services/form-error-handler.service';
import { IxValidatorsService } from 'app/modules/ix-forms/services/ix-validators.service';
import { emailValidator } from 'app/modules/ix-forms/validators/email-validation/email-validation';
import { ImageValidatorService } from 'app/modules/ix-forms/validators/image-validator/image-validator.service';

@UntilDestroy()
@Component({
  selector: 'ix-file-ticket-licensed',
  styleUrls: ['file-ticket-licensed.component.scss'],
  templateUrl: './file-ticket-licensed.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileTicketLicensedComponent {
  @Input() dialogRef: MatDialogRef<FeedbackDialogComponent>;
  @Input() isLoading: boolean;
  @Output() isLoadingChange = new EventEmitter<boolean>();

  protected form = this.formBuilder.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, emailValidator()]],
    cc: [[] as string[], [
      this.validatorsService.customValidator(
        (control: AbstractControl<string[]>) => {
          return control.value?.every((item: string) => EmailValidator.validate(item));
        },
        this.translate.instant(helptext.cc.err),
      ),
    ]],
    phone: ['', [Validators.required]],
    category: [TicketCategory.Bug, [Validators.required]],
    environment: [TicketEnvironment.Production, [Validators.required]],
    criticality: [TicketCriticality.Inquiry, [Validators.required]],
    title: ['', [Validators.required, Validators.maxLength(200)]],

    message: ['', [Validators.maxLength(20000)]],
    images: [[] as File[], [], this.imageValidator.validateImages()],
    attach_debug: [true],
    attach_images: [false],
    take_screenshot: [true],
  });

  protected readonly messagePlaceholder = helptext.bug.message.placeholder;
  protected readonly acceptedFiles = ticketAcceptedFiles;

  readonly categoryOptions$ = of(mapToOptions(ticketCategoryLabels, this.translate));
  readonly environmentOptions$ = of(mapToOptions(ticketEnvironmentLabels, this.translate));
  readonly criticalityOptions$ = of(mapToOptions(ticketCriticalityLabels, this.translate));

  readonly tooltips = {
    name: helptext.name.tooltip,
    email: helptext.email.tooltip,
    cc: helptext.cc.tooltip,
    phone: helptext.phone.tooltip,
    category: helptext.type.tooltip,
    environment: helptext.environment.tooltip,
    criticality: helptext.criticality.tooltip,
    title: helptext.title.tooltip,
    attach_debug: helptext.attach_debug.tooltip,
  };

  constructor(
    private formBuilder: FormBuilder,
    private translate: TranslateService,
    private validatorsService: IxValidatorsService,
    private feedbackService: FeedbackService,
    private router: Router,
    private imageValidator: ImageValidatorService,
    private formErrorHandler: FormErrorHandlerService,
    @Inject(WINDOW) private window: Window,
  ) { }

  onUserGuidePressed(): void {
    this.window.open('https://www.truenas.com/docs/hub/');
  }

  onEulaPressed(): void {
    // TODO: Does not close dialog
    this.router.navigate(['system', 'support', 'eula']);
  }

  onSubmit(): void {
    this.isLoadingChange.emit(true);

    this.feedbackService.createTicketLicensed(this.form.value).pipe(
      finalize(() => this.isLoadingChange.emit(false)),
      untilDestroyed(this),
    ).subscribe({
      next: (createdTicket) => this.onSuccess(createdTicket.url),
      error: (error) => this.formErrorHandler.handleWsFormError(error, this.form),
    });
  }

  private onSuccess(ticketUrl: string): void {
    this.feedbackService.showTicketSuccessMsg(ticketUrl);
    this.dialogRef.close();
  }
}
