import { Component, Input, TemplateRef } from '@angular/core';

@Component({
  selector: 'ix-missing-access-wrapper',
  templateUrl: './missing-access-wrapper.component.html',
  styleUrls: ['./missing-access-wrapper.component.scss'],
})
export class MissingAccessWrapperComponent {
  @Input() template: TemplateRef<unknown>;
  @Input() class: string;
}
