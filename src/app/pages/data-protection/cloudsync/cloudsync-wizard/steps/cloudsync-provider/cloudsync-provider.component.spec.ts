import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { createComponentFactory, mockProvider, Spectator } from '@ngneat/spectator/jest';
import { of } from 'rxjs';
import { mockCall, mockWebsocket } from 'app/core/testing/utils/mock-websocket.utils';
import { CloudCredentialsSelectModule } from 'app/modules/custom-selects/cloud-credentials-select/cloud-credentials-select.module';
import { IxSlideInRef } from 'app/modules/ix-forms/components/ix-slide-in/ix-slide-in-ref';
import { CHAINED_SLIDE_IN_REF, SLIDE_IN_DATA } from 'app/modules/ix-forms/components/ix-slide-in/ix-slide-in.token';
import { IxFormsModule } from 'app/modules/ix-forms/ix-forms.module';
import { IxFormHarness } from 'app/modules/ix-forms/testing/ix-form.harness';
import { GooglePhotosProviderFormComponent } from 'app/pages/credentials/backup-credentials/cloud-credentials-form/provider-forms/google-photos-provider-form/google-photos-provider-form.component';
import { StorjProviderFormComponent } from 'app/pages/credentials/backup-credentials/cloud-credentials-form/provider-forms/storj-provider-form/storj-provider-form.component';
import { CloudsyncProviderDescriptionComponent } from 'app/pages/data-protection/cloudsync/cloudsync-provider-description/cloudsync-provider-description.component';
import { storjProvider, googlePhotosProvider, googlePhotosCreds } from 'app/pages/data-protection/cloudsync/cloudsync-wizard/cloudsync-wizard.testing.utils';
import { CloudsyncProviderComponent } from 'app/pages/data-protection/cloudsync/cloudsync-wizard/steps/cloudsync-provider/cloudsync-provider.component';
import { CloudCredentialService } from 'app/services/cloud-credential.service';
import { DatasetService } from 'app/services/dataset-service/dataset.service';
import { DialogService } from 'app/services/dialog.service';
import { IxChainedSlideInService } from 'app/services/ix-chained-slide-in.service';
import { WebSocketService } from 'app/services/ws.service';

describe('CloudsyncProviderComponent', () => {
  let spectator: Spectator<CloudsyncProviderComponent>;
  let loader: HarnessLoader;
  let form: IxFormHarness;
  const chainedComponentRef = {
    next: jest.fn(),
    swap: jest.fn(),
  };

  const loading = {
    emit: jest.fn(),
  };
  const save = {
    emit: jest.fn(),
  };

  const createComponent = createComponentFactory({
    component: CloudsyncProviderComponent,
    imports: [
      ReactiveFormsModule,
      IxFormsModule,
      CloudsyncProviderDescriptionComponent,
      CloudCredentialsSelectModule,
    ],
    declarations: [
      GooglePhotosProviderFormComponent,
      StorjProviderFormComponent,
    ],
    providers: [
      { provide: CHAINED_SLIDE_IN_REF, useValue: chainedComponentRef },
      mockWebsocket([
        mockCall('cloudsync.providers', [storjProvider, googlePhotosProvider]),
        mockCall('cloudsync.credentials.query', [googlePhotosCreds]),
        mockCall('cloudsync.credentials.verify', {
          valid: true,
        }),
      ]),
      mockProvider(CloudCredentialService, {
        getCloudsyncCredentials: jest.fn(() => of([googlePhotosCreds])),
        getProviders: jest.fn(() => of([storjProvider, googlePhotosProvider])),
      }),
      mockProvider(IxChainedSlideInService, {
        pushComponent: jest.fn(() => of()),
      }),
      mockProvider(DatasetService),
      mockProvider(MatDialog, {
        open: jest.fn(() => ({
          afterClosed: () => of(),
        })),
      }),
      mockProvider(IxSlideInRef),
      mockProvider(DialogService, {
        confirm: jest.fn(() => of()),
      }),
      { provide: SLIDE_IN_DATA, useValue: undefined },
    ],
  });

  beforeEach(async () => {
    spectator = createComponent();
    Object.defineProperty(spectator.component, 'loading', {
      value: loading,
    });
    Object.defineProperty(spectator.component, 'save', {
      value: save,
    });
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
    form = await loader.getHarness(IxFormHarness);
  });

  it('emits the value of credentials when credentials value changes', async () => {
    await form.fillForm({
      Credentials: 'Google Photos (Google Photos)',
    });

    const verifyButton = await loader.getHarness(MatButtonHarness.with({ text: 'Verify Credential' }));
    await verifyButton.click();

    expect(save.emit).toHaveBeenNthCalledWith(1, googlePhotosCreds);
  });

  it('verifies entered values when user presses Verify', async () => {
    await form.fillForm({
      Credentials: 'Google Photos (Google Photos)',
    });

    const verifyButton = await loader.getHarness(MatButtonHarness.with({ text: 'Verify Credential' }));
    await verifyButton.click();

    expect(loading.emit).toHaveBeenNthCalledWith(1, true);
    expect(loading.emit).toHaveBeenNthCalledWith(2, false);

    expect(spectator.inject(WebSocketService).call).toHaveBeenCalledWith('cloudsync.credentials.verify', [{
      provider: 'GOOGLE_PHOTOS',
      attributes: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        token: 'test-token',
      },
    }]);
  });
});
