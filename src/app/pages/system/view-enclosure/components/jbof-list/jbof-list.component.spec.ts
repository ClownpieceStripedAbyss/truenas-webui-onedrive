import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Spectator, createComponentFactory, mockProvider } from '@ngneat/spectator/jest';
import { of } from 'rxjs';
import { MockWebsocketService } from 'app/core/testing/classes/mock-websocket.service';
import { mockAuth } from 'app/core/testing/utils/mock-auth.utils';
import { mockCall, mockWebsocket } from 'app/core/testing/utils/mock-websocket.utils';
import { Jbof } from 'app/interfaces/jbof.interface';
import { IxIconHarness } from 'app/modules/ix-icon/ix-icon.harness';
import { IxTable2Harness } from 'app/modules/ix-table2/components/ix-table2/ix-table2.harness';
import { IxTable2Module } from 'app/modules/ix-table2/ix-table2.module';
import { JbosFormComponent } from 'app/pages/system/view-enclosure/components/jbof-form/jbof-form.component';
import { JbofListComponent } from 'app/pages/system/view-enclosure/components/jbof-list/jbof-list.component';
import { DialogService } from 'app/services/dialog.service';
import { IxSlideInService } from 'app/services/ix-slide-in.service';
import { WebSocketService } from 'app/services/ws.service';

const fakeJbofDataSource: Jbof[] = [
  {
    id: 1,
    description: 'description 1',
    mgmt_ip1: '11.11.11.11',
    mgmt_ip2: '12.12.12.12',
    mgmt_username: 'admin',
    mgmt_password: 'qwerty',
  },
  {
    id: 2,
    description: 'description 2',
    mgmt_ip1: '13.13.13.13',
    mgmt_ip2: '',
    mgmt_username: 'user',
    mgmt_password: '12345678',
  },
];

describe('JbofListComponent', () => {
  let spectator: Spectator<JbofListComponent>;
  let loader: HarnessLoader;
  let table: IxTable2Harness;

  const createComponent = createComponentFactory({
    component: JbofListComponent,
    imports: [
      IxTable2Module,
    ],
    providers: [
      mockWebsocket([
        mockCall('jbof.query', fakeJbofDataSource),
        mockCall('jbof.delete', true),
        mockCall('jbof.licensed', 1),
      ]),
      mockProvider(DialogService, {
        confirm: jest.fn(() => of(true)),
      }),
      mockProvider(IxSlideInService, {
        open: jest.fn(() => {
          return { slideInClosed$: of(true) };
        }),
        onClose$: of(),
      }),
      mockAuth(),
    ],
  });

  beforeEach(async () => {
    spectator = createComponent();
    loader = TestbedHarnessEnvironment.loader(spectator.fixture);
    table = await loader.getHarness(IxTable2Harness);
  });

  it('should show table rows', async () => {
    const expectedRows = [
      ['Description', 'IPs', 'Username', ''],
      ['description 1', '11.11.11.11, 12.12.12.12', 'admin', ''],
      ['description 2', '13.13.13.13', 'user', ''],
    ];

    const cells = await table.getCellTexts();
    expect(cells).toEqual(expectedRows);
  });

  it('opens form when "Edit" button is pressed', async () => {
    const editButton = await table.getHarnessInRow(IxIconHarness.with({ name: 'edit' }), 'description 1');
    await editButton.click();

    expect(spectator.inject(IxSlideInService).open).toHaveBeenCalledWith(JbosFormComponent, {
      data: fakeJbofDataSource[0],
    });
  });

  it('opens delete dialog when "Delete" button is pressed', async () => {
    const deleteButton = await table.getHarnessInRow(IxIconHarness.with({ name: 'delete' }), 'description 2');
    await deleteButton.click();

    expect(spectator.inject(WebSocketService).call).toHaveBeenCalledWith('jbof.delete', [2]);
  });

  it('enables Add button when existing are less than licensed', () => {
    spectator.inject(MockWebsocketService).mockCall('jbof.licensed', 3);
    spectator.component.updateAvailableJbof();
    expect(spectator.component.canAddJbof).toBeTruthy();
  });

  it('disables Add button when existing are equal to licensed', () => {
    spectator.inject(MockWebsocketService).mockCall('jbof.licensed', 2);
    spectator.component.updateAvailableJbof();
    expect(spectator.component.canAddJbof).toBeFalsy();
  });

  it('disables Add button when existing are more than licensed', () => {
    spectator.inject(MockWebsocketService).mockCall('jbof.licensed', 1);
    spectator.component.updateAvailableJbof();
    expect(spectator.component.canAddJbof).toBeFalsy();
  });
});
