import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { createComponentFactory, mockProvider, Spectator } from '@ngneat/spectator/jest';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { mockEntityJobComponentRef } from 'app/core/testing/utils/mock-entity-job-component-ref.utils';
import { ProductType } from 'app/enums/product-type.enum';
import { SystemSecurityConfig } from 'app/interfaces/system-security-config.interface';
import { IxSlideInRef } from 'app/modules/ix-forms/components/ix-slide-in/ix-slide-in-ref';
import { SLIDE_IN_DATA } from 'app/modules/ix-forms/components/ix-slide-in/ix-slide-in.token';
import { IxFormsModule } from 'app/modules/ix-forms/ix-forms.module';
import { IxFormHarness } from 'app/modules/ix-forms/testing/ix-form.harness';
import { SnackbarService } from 'app/modules/snackbar/services/snackbar.service';
import { SystemSecurityFormComponent } from 'app/pages/system/advanced/system-security/system-security-form/system-security-form.component';
import { DialogService } from 'app/services/dialog.service';
import { FipsService } from 'app/services/fips.service';
import { SystemGeneralService } from 'app/services/system-general.service';
import { selectIsHaLicensed } from 'app/store/ha-info/ha-info.selectors';
import { selectSystemInfo } from 'app/store/system-info/system-info.selectors';

const fakeSystemSecurityConfig: SystemSecurityConfig = {
  enable_fips: false,
};

describe('SystemSecurityFormComponent', () => {
  let spectator: Spectator<SystemSecurityFormComponent>;
  let loader: HarnessLoader;
  let form: IxFormHarness;

  const createComponent = createComponentFactory({
    component: SystemSecurityFormComponent,
    imports: [
      ReactiveFormsModule,
      IxFormsModule,
    ],
    providers: [
      provideMockStore({
        selectors: [
          { selector: selectSystemInfo, value: { hostname: 'host.truenas.com' } },
          { selector: selectIsHaLicensed, value: false },
        ],
      }),
      mockProvider(DialogService, {
        confirm: jest.fn(() => of()),
      }),
      mockProvider(SnackbarService),
      mockProvider(MatDialog, {
        open: jest.fn(() => mockEntityJobComponentRef),
      }),
      mockProvider(SystemGeneralService, {
        getProductType: () => ProductType.Scale,
      }),
      mockProvider(IxSlideInRef),
      { provide: SLIDE_IN_DATA, useValue: fakeSystemSecurityConfig },
      mockProvider(FipsService, {
        promptForRestart: jest.fn(() => of(undefined)),
      }),
      mockAuth(),
    ],
  });

  describe('System Security config', () => {
    beforeEach(async () => {
      spectator = createComponent();
      loader = TestbedHarnessEnvironment.loader(spectator.fixture);
      form = await loader.getHarness(IxFormHarness);
    });

    it('saves FIPS config when form is filled and Save is pressed', async () => {
      await form.fillForm({
        'Enable FIPS': true,
      });

      const saveButton = await loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
      await saveButton.click();

      expect(mockEntityJobComponentRef.componentInstance.setCall).toHaveBeenCalledWith('system.security.update', [{
        enable_fips: true,
      }]);
      expect(spectator.inject(SnackbarService).success).toHaveBeenCalledWith(
        'System Security Settings Updated.',
      );
    });

    it('prompts to reload when settings are saved and HA is not licensed', async () => {
      await form.fillForm({
        'Enable FIPS': true,
      });

      const saveButton = await loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
      await saveButton.click();

      expect(spectator.inject(FipsService).promptForRestart).toHaveBeenCalled();
    });

    it('does not prompt to restart when settings are saved and HA is licensed, because this is handled in HaFipsEffects', async () => {
      spectator.inject(MockStore).overrideSelector(selectIsHaLicensed, true);

      await form.fillForm({
        'Enable FIPS': true,
      });

      const saveButton = await loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
      await saveButton.click();

      expect(spectator.inject(FipsService).promptForRestart).not.toHaveBeenCalled();
    });

    it('loads and shows current System Security config', async () => {
      const values = await form.getValues();

      expect(values).toEqual({
        'Enable FIPS': false,
      });
    });
  });
});
