import { Injectable } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { ComponentStore, tapResponse } from '@ngrx/component-store';
import _ from 'lodash';
import {
  combineLatest, forkJoin, Observable, of, Subject, tap,
} from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { EnclosureSlotDiskStatus } from 'app/enums/enclosure-slot-status.enum';
import { VdevType, TopologyItemType } from 'app/enums/v-dev-type.enum';
import {
  DiskEnclosureInfo,
  Enclosure,
  EnclosureElement,
  EnclosureElementsGroup,
  EnclosureSlot,
  EnclosureView,
} from 'app/interfaces/enclosure.interface';
import { Pool } from 'app/interfaces/pool.interface';
import {
  Disk, TopologyDisk, TopologyItem, VDev,
} from 'app/interfaces/storage.interface';
import { DialogService } from 'app/services/dialog.service';
import { DisksUpdateService } from 'app/services/disks-update.service';
import { ErrorHandlerService } from 'app/services/error-handler.service';
import { WebSocketService } from 'app/services/ws.service';

export interface EnclosureState {
  areEnclosuresLoading: boolean;
  arePoolsLoading: boolean;
  areDisksLoading: boolean;
  enclosures: Enclosure[];
  pools: Pool[];
  disks: Disk[];
  enclosureViews?: EnclosureView[];
  selectedEnclosure?: number | null;
}

const initialState: EnclosureState = {
  areEnclosuresLoading: false,
  arePoolsLoading: false,
  areDisksLoading: false,
  enclosures: [],
  pools: [],
  disks: [],
  enclosureViews: [],
  selectedEnclosure: 0,
};

interface ProcessParameters {
  pools: Pool[];
  disks: Disk[];
  enclosures: Enclosure[];
}

@UntilDestroy()
@Injectable()
export class EnclosureStore extends ComponentStore<EnclosureState> {
  readonly data$ = this.select((state) => state);
  readonly enclosureViews$ = this.select((state) => state.enclosureViews);

  private disksUpdateSubscriptionId: string;

  constructor(
    private ws: WebSocketService,
    private disksUpdateService: DisksUpdateService,
    private dialogService: DialogService,
    private errorHandler: ErrorHandlerService,
  ) {
    super(initialState);
    this.listenForDiskUpdates();
  }

  readonly loadData = this.effect((triggers$: Observable<void>) => {
    return triggers$.pipe(
      tap(() => {
        this.patchState({
          ...initialState,
          areEnclosuresLoading: true,
          arePoolsLoading: true,
          areDisksLoading: true,
        });
      }),
      switchMap(() => this.updateState()),
    );
  });

  getDiskInfoFromEnclosures(diskName: string, enclosures: Enclosure[]): DiskEnclosureInfo {
    for (const enclosure of enclosures) {
      for (const element of enclosure.elements) {
        const diskEnclosureInfo = this.getDiskInfoFromEnclosureElements(diskName, enclosure.number, element);
        if (diskEnclosureInfo) {
          return diskEnclosureInfo;
        }
      }
    }
    return null;
  }

  getDiskInfoFromEnclosureElements(
    diskName: string,
    enclosure: number,
    enclosureElement: EnclosureElement | EnclosureElementsGroup,
  ): DiskEnclosureInfo {
    if ((enclosureElement as EnclosureElement).data?.Device === diskName) {
      return {
        enclosure,
        slot: (enclosureElement as EnclosureElement).slot,
      };
    }
    enclosureElement = enclosureElement as EnclosureElementsGroup;
    if (!enclosureElement.elements?.length) {
      return null;
    }

    for (const element of enclosureElement.elements) {
      const diskEnclosureInfo = this.getDiskInfoFromEnclosureElements(diskName, enclosure, element);
      if (diskEnclosureInfo) {
        return diskEnclosureInfo;
      }
    }
    return null;
  }

  private updateState(): Observable<{
    enclosures: Enclosure[];
    pools: Pool[];
    disks: Disk[];
    enclosureViews: EnclosureView[];
  }> {
    return this.getEnclosures().pipe(
      switchMap((enclosures) => {
        return forkJoin({
          enclosures: of(enclosures).pipe(
            this.patchStateWithEnclosureData(),
          ),
          pools: this.getPools().pipe(
            this.patchStateWithPoolData(),
          ),
          disks: this.getDisks(enclosures).pipe(
            this.patchStateWithDisksData(),
          ),
          enclosureViews: this.getEnclosureViewsData().pipe(
            this.patchStateWithEnclosureViewsData(),
          ),
        });
      }),
    );
  }

  patchStateWithEnclosureViewsData(): (source: Observable<EnclosureView[]>) => Observable<EnclosureView[]> {
    return tapResponse<EnclosureView[]>(
      (views: EnclosureView[]) => {
        this.patchState({
          enclosureViews: [...views],
        });
      },
      (error: unknown) => {
        this.dialogService.error(this.errorHandler.parseError(error));
      },
    );
  }

  getEnclosureViewsData(): Observable<EnclosureView[]> {
    return this.getEnclosures().pipe(
      switchMap((enclosures) => {
        return combineLatest({
          enclosures: of(enclosures),
          pools: this.getPools(),
          disks: this.getDisks(enclosures),
        });
      }),
      switchMap(this.processData.bind(this)),
    );
  }

  getEnclosures(): Observable<Enclosure[]> {
    return this.ws.call('enclosure.query');
  }

  patchStateWithEnclosureData(): (source: Observable<Enclosure[]>) => Observable<Enclosure[]> {
    return tapResponse<Enclosure[]>(
      (enclosures: Enclosure[]) => {
        this.patchState({
          areEnclosuresLoading: false,
          enclosures: [...enclosures],
        });
      },
      (error: unknown) => {
        this.patchState({
          areEnclosuresLoading: false,
        });
        this.dialogService.error(this.errorHandler.parseError(error));
      },
    );
  }

  processData({
    enclosures, pools, disks,
  }: {
    enclosures: Enclosure[];
    pools: Pool[];
    disks: Disk[];
    selectedEnclosure: number;
  }): Observable<EnclosureView[]> {
    /*
    * EnclosureViews setup
    * */
    let enclosureViews: EnclosureView[] = [];
    if (!enclosures.length) return of(enclosureViews);

    // Deal with M50
    const isM50 = enclosures.filter((enclosure: Enclosure) => {
      return enclosure.id === 'm50_plx_enclosure' || enclosure.id === 'm60_plx_enclosure';
    }).length;
    if (isM50) {
      const mergedData = this.mergeMseriesEnclosures({
        pools,
        disks,
        enclosures,
      });
      disks = mergedData.disks;
      enclosures = mergedData.enclosures;
    }

    enclosureViews = enclosures.map((enclosure: Enclosure) => {
      return {
        isController: enclosure.controller,
        isRackmount: this.isRackmount(enclosure),
        slots: [],
        number: enclosure.number,
        model: enclosure.model,
        expanders: (enclosure.elements as EnclosureElementsGroup[]).find((item) => {
          return item.name === 'SAS Expander';
        })?.elements,
      } as EnclosureView;
    });
    enclosureViews.sort((a, b) => a.number - b.number);

    /*
    * EnclosureSlots setup
    * */
    // Add Slots to View
    enclosures.forEach((enclosure: Enclosure) => {
      const slots = (enclosure.elements as EnclosureElementsGroup[]).find((element: EnclosureElementsGroup) => {
        return element.name === 'Array Device Slot';
      }).elements;

      const enclosureSlots = slots.map((slotSource: EnclosureElement) => {
        const enclosureDisk = disks.find((disk: Disk) => disk.name === slotSource.data.Device);
        const pool = this.verifiedDiskPool(enclosureDisk, pools);
        const topologyInfo = pool ? this.findVdevByDisk(enclosureDisk, pool) : null;

        const enclosureSlot: EnclosureSlot = {
          disk: enclosureDisk,
          isSelected: false,
          enclosure: enclosure.number,
          slot: slotSource.slot,
          slotStatus: slotSource.status,
          fault: slotSource.fault,
          identify: slotSource.identify,
          pool: pool ? pool.name : null,
          vdev: pool ? topologyInfo.vdev : null,
          topologyStatus: enclosureDisk ? EnclosureSlotDiskStatus.Available : null,
        };

        if (topologyInfo?.vdev || topologyInfo?.category) {
          enclosureSlot.topologyCategory = topologyInfo ? topologyInfo.category : null;
          enclosureSlot.vdev = topologyInfo ? topologyInfo.vdev : null;

          const topologyDisk = this.findTopologyDiskInVdev(
            topologyInfo.vdev,
            enclosureSlot.disk.name,
          );
          enclosureSlot.topologyStatus = topologyDisk.status;
          enclosureSlot.topologyStats = topologyDisk.stats;
        }

        return enclosureSlot;
      });

      // Attach it to the EnclosureView
      const enclosureView: EnclosureView = enclosureViews.find((view: EnclosureView) => {
        return view.number === enclosure.number;
      });
      enclosureView.slots = enclosureSlots;
      enclosureView.pools = this.getPoolNamesInEnclosureView(enclosureView);
    });

    return of(enclosureViews);
  }

  mergeMseriesEnclosures(data: ProcessParameters): ProcessParameters {
    let rearId = '';
    const rearNumber = data.enclosures.find((enclosure: Enclosure) => {
      if (enclosure.id === 'm50_plx_enclosure' || enclosure.id === 'm60_plx_enclosure') {
        rearId = enclosure.id;
        return true;
      }
      return false;
    }).number;

    const frontNumber = data.enclosures.find((enclosure: Enclosure) => {
      return enclosure.id !== rearId && enclosure.controller;
    }).number;

    const updatedDisks = data.disks.map((disk: Disk) => {
      const updatedDisk = disk;
      if (disk.enclosure && disk.enclosure.number === rearNumber) {
        updatedDisk.enclosure.number = frontNumber;
        updatedDisk.enclosure.slot += 24;
      }
      return updatedDisk || disk;
    });

    const rearEnclosure = data.enclosures.find((enclosure) => enclosure.number === rearNumber);
    const rearChassisElements: EnclosureElement | EnclosureElementsGroup = rearEnclosure.elements[0];
    const rearSlotElements: EnclosureElement[] = (rearChassisElements as EnclosureElementsGroup).elements
      .map((element: EnclosureElement) => {
        element.slot += 24;
        return element;
      });

    const frontEnclosure = data.enclosures.find((enclosure) => enclosure.number === frontNumber);
    const frontChassisElements: EnclosureElement | EnclosureElementsGroup = frontEnclosure.elements[0];
    const frontSlotElements = (frontChassisElements as EnclosureElementsGroup).elements;
    const mergedSlotElements = frontSlotElements.concat(rearSlotElements);
    (frontEnclosure.elements as EnclosureElementsGroup[])[0].elements = mergedSlotElements;
    const updatedEnclosures = data.enclosures.filter((enclosure: Enclosure) => enclosure.number !== rearNumber);

    const updatedData: ProcessParameters = {
      pools: data.pools,
      disks: updatedDisks,
      enclosures: updatedEnclosures,
    };

    return updatedData;
  }

  findVdevByDisk(disk: Disk, pool: Pool): { category: VdevType | null; vdev: TopologyItem | null } | null {
    if (!disk || !pool) return null;

    let topologyItem: TopologyItem | null = null;
    let topologyCategory: VdevType | null;

    const categories: VdevType[] = [
      VdevType.Data,
      VdevType.Cache,
      VdevType.Spare,
      VdevType.Special,
      VdevType.Log,
      VdevType.Dedup,
    ];

    categories.forEach((category: VdevType) => {
      const found: TopologyItem = pool.topology[category].find((item: TopologyItem) => {
        switch (item.type) {
          case TopologyItemType.Disk:
            return item.disk === disk.name;
          case TopologyItemType.Spare:
          case TopologyItemType.Mirror:
          case TopologyItemType.Log:
          case TopologyItemType.Stripe:
          case TopologyItemType.Raidz1:
          case TopologyItemType.Raidz2:
          case TopologyItemType.Raidz3:
          case TopologyItemType.Draid:
            return item.children.find((device: TopologyDisk) => device.disk === disk.name);
          default:
            return false;
        }
      });
      if (found) {
        topologyItem = found;
        topologyCategory = category;
      }
    });
    return {
      vdev: topologyItem,
      category: topologyCategory,
    };
  }

  updateLabel(enclosureId: string, label: string): void {
    this.patchState((state) => {
      return {
        ...state,
        enclosures: state.enclosures.map((enclosure: Enclosure) => {
          if (enclosure.id !== enclosureId) {
            return enclosure;
          }

          return {
            ...enclosure,
            label,
          };
        }),
      };
    });
  }

  private findTopologyDiskInVdev(vdev: TopologyItem, name: string): TopologyDisk | VDev | null {
    if (!vdev?.type) return null;

    return vdev.type !== TopologyItemType.Disk
      ? vdev.children.find((topologyDisk: TopologyDisk) => topologyDisk.disk === name)
      : vdev;
  }

  // Temporarily here until mock ability is merged
  private verifiedDiskPool(disk: Disk, pools: Pool[]): Pool | null {
    let result: Pool | null = null;
    pools.forEach((pool: Pool) => {
      if (pool.topology) {
        const test = this.findVdevByDisk(disk, pool);
        if (test?.category || test?.vdev) result = pool;
      }
    });
    return result;
  }

  getPools(): Observable<Pool[]> {
    return this.ws.call('pool.query', [[], { extra: { is_upgraded: true } }]);
  }

  listenForDiskUpdates(): void { // Observable<Disk[]> {
    if (!this.disksUpdateSubscriptionId) {
      const diskUpdatesTrigger$ = new Subject<Disk[]>();
      this.disksUpdateSubscriptionId = this.disksUpdateService.addSubscriber(diskUpdatesTrigger$, true);
      diskUpdatesTrigger$.pipe(untilDestroyed(this)).subscribe(() => {
        this.loadData();
      });
    }
  }

  patchStateWithPoolData(): (source: Observable<Pool[]>) => Observable<Pool[]> {
    return tapResponse<Pool[]>(
      (pools: Pool[]) => {
        this.patchState({
          arePoolsLoading: false,
          pools: _.sortBy(pools, (pool) => pool.name),
        });
      },
      (error: unknown) => {
        this.patchState({
          arePoolsLoading: false,
        });
        this.dialogService.error(this.errorHandler.parseError(error));
      },
    );
  }

  getDisks(enclosures: Enclosure[]): Observable<Disk[]> {
    return this.ws.call('disk.query', [[], { extra: { pools: true } }]).pipe(
      map((disks) => {
        return disks.map((disk) => {
          const enclosureInfo = this.getDiskInfoFromEnclosures(disk.name, enclosures);
          if (enclosureInfo) {
            return {
              ...disk,
              enclosure: {
                number: enclosureInfo.enclosure,
                slot: enclosureInfo.slot,
              },
            };
          }
          return disk;
        });
      }),
    );
  }

  patchStateWithDisksData(): (source: Observable<Disk[]>) => Observable<Disk[]> {
    return tapResponse<Disk[]>(
      (disks: Disk[]) => {
        this.patchState({
          disks: [...disks],
          areDisksLoading: false,
        });
      },
      (error: unknown) => {
        this.patchState({
          areDisksLoading: false,
        });
        this.dialogService.error(this.errorHandler.parseError(error));
      },
    );
  }

  private isRackmount(enclosure: Enclosure): boolean {
    switch (enclosure.model) {
      case 'FREENAS-MINI-3.0':
      case 'TRUENAS-MINI-3.0':
      case 'FREENAS-MINI-3.0-E':
      case 'TRUENAS-MINI-3.0-E':
      case 'FREENAS-MINI-3.0-E+':
      case 'TRUENAS-MINI-3.0-E+':
      case 'FREENAS-MINI-3.0-X':
      case 'TRUENAS-MINI-3.0-X':
      case 'FREENAS-MINI-3.0-X+':
      case 'TRUENAS-MINI-3.0-X+':
      case 'FREENAS-MINI-3.0-XL+':
      case 'TRUENAS-MINI-3.0-XL+':
        return false;
      default:
        return true;
    }
  }

  readonly updateSelectedEnclosure = this.updater((state, selectedEnclosure: number) => {
    return {
      ...state,
      selectedEnclosure,
    };
  });

  private getPoolNamesInEnclosureView(enclosureView: EnclosureView): string[] {
    const pools: string[] = enclosureView?.slots
      .map((slot: EnclosureSlot) => slot.pool)
      .filter((poolName: string) => poolName !== null);

    return [...new Set(pools)];
  }
}
